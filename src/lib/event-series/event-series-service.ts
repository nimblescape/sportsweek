/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { reorderCollection } from "@/lib/firebase/reorder";
import {
  ARCHIVED_IS_READ_ONLY_HINT,
  LAST_TEMPLATE_HINT,
  NO_SUCH_EVENT_SERIES,
} from "@/lib/event-series/event-series-state";
import { normalizeName } from "@/lib/firebase/name-key";
import { savedReportPath } from "@/lib/report/saved-reports";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { registrationPath } from "@/lib/registration/registration";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";

const nameSchema = eventSeriesSchema.shape.name;

function parseName(value: string): string {
  const parsed = nameSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      parsed.error.issues[0]?.message ?? "Ungültiger Name.",
    );
  }
  return parsed.data;
}

function eventSeriesDoc(id: string) {
  return adminDb.collection(COLLECTIONS.eventSeries).doc(id);
}

/**
 * Event series names are unique, compared ignoring surrounding whitespace and letter case (US-4).
 * A Firestore equality does neither, so the comparison is made against the stored `nameKey` —
 * derived here on every write and never sent by a client.
 *
 * The query runs inside the write's own transaction, which is what makes it safe: Firestore locks
 * the index range a transactional query scans, so a second create racing the first waits and then
 * sees it. Every read has to precede the first write, so call this before writing the document.
 */
async function assertNameIsFree(
  transaction: Transaction,
  { name, ownerId }: { name: string; ownerId?: string },
): Promise<string> {
  const nameKey = normalizeName(name);
  const taken = await transaction.get(
    adminDb.collection(COLLECTIONS.eventSeries).where("nameKey", "==", nameKey).limit(2),
  );

  if (taken.docs.some((doc) => doc.id !== ownerId)) {
    throw new ServiceError(ErrorCode.Conflict, `Den Namen „${name.trim()}" gibt es bereits.`);
  }
  return nameKey;
}

export async function createEventSeries(input: { name: string }): Promise<EventSeries> {
  const name = parseName(input.name);

  // A new event series goes to the end of the teacher's order (see Ordering).
  const position = (await adminDb.collection(COLLECTIONS.eventSeries).count().get()).data().count;

  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.eventSeries).doc();
    const nameKey = await assertNameIsFree(transaction, { name });

    // Blank rather than seeded: the application cannot know whether this is a Wintersportwoche or
    // a Kulturwoche, and an empty list is simply a question the student is never asked (US-21).
    const data = {
      name,
      nameKey,
      isTemplate: false,
      isArchived: false,
      isOpenToStudents: false,
      hasRegistrations: false,
      position,
      events: [],
      classOptions: [],
      programs: [],
      skillLevels: [],
      seasonPassOptions: [],
      busPickupPoints: [],
      foodOptions: [],
    };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
  });
}

/** Ordering touches no name or flag, so it needs none of the guards the other writes carry. */
export async function reorderEventSeries(orderedIds: readonly string[]): Promise<void> {
  await reorderCollection({ collection: COLLECTIONS.eventSeries, orderedIds });
}

export type EventSeriesUpdate = {
  name?: string;
  isArchived?: boolean;
  isOpenToStudents?: boolean;
};

/**
 * Archiving signs an event series off, so it needs registrations to sign off on, and the query
 * that checks is also what keeps the denormalised flag honest for clients — who cannot read the
 * registrations themselves (see firestore.rules). A rename is refused once archived, for the
 * same reason: what a finished series is called is settled with it (US-19).
 */
export async function updateEventSeries(
  id: string,
  update: EventSeriesUpdate,
): Promise<EventSeries> {
  const name = update.name === undefined ? undefined : parseName(update.name);
  const wantsArchival = update.isArchived === true;

  return adminDb.runTransaction(async (transaction) => {
    const reference = eventSeriesDoc(id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);
    }

    const current = eventSeriesSchema.parse({ id, ...snapshot.data() });
    const isArchived = update.isArchived ?? current.isArchived;
    const renaming = name !== undefined && name !== current.name;

    if (renaming && current.isArchived) {
      throw new ServiceError(ErrorCode.Conflict, ARCHIVED_IS_READ_ONLY_HINT);
    }

    // One rule shape, three reasons (US-19, US-22, US-23): a template can never take
    // registrations, an archived series is read-only and cannot even be selected, and a series
    // with no classes has nothing to invite anybody into. Asked against the archive state this
    // call is leaving behind, so opening and archiving at once is refused rather than silently
    // resolved in archiving's favour.
    if (update.isOpenToStudents === true) {
      if (current.isTemplate) {
        throw new ServiceError(
          ErrorCode.Conflict,
          "Eine Vorlage kann nicht für Anmeldungen freigeschaltet werden.",
        );
      }
      if (isArchived) {
        throw new ServiceError(
          ErrorCode.Conflict,
          "Eine archivierte Eventreihe kann nicht freigeschaltet werden.",
        );
      }
      if (current.classOptions.length === 0) {
        throw new ServiceError(
          ErrorCode.Conflict,
          "Eine Eventreihe ohne Klassen kann nicht freigeschaltet werden.",
        );
      }
    }

    let hasRegistrations = current.hasRegistrations;
    if (wantsArchival) {
      const registrations = await transaction.get(
        adminDb.collection(registrationPath(id)).limit(1),
      );
      if (registrations.empty) {
        throw new ServiceError(
          ErrorCode.Conflict,
          "Eine Eventreihe ohne Anmeldungen kann nicht archiviert werden.",
        );
      }
      hasRegistrations = true;
    }

    if (renaming) {
      await assertNameIsFree(transaction, { name, ownerId: id });
    }

    // Archiving closes a series to students, and unarchiving deliberately does not reopen it:
    // looking at last year is not letting last year's students back in (US-19).
    const isOpenToStudents = isArchived
      ? false
      : (update.isOpenToStudents ?? current.isOpenToStudents);

    // `update` rather than `set`: the document also carries the seven maintained lists (US-21),
    // and naming them here only to preserve them would drop the next one somebody adds.
    const changed = {
      name: name ?? current.name,
      nameKey: normalizeName(name ?? current.name),
      isArchived,
      isOpenToStudents,
      hasRegistrations,
    };
    transaction.update(reference, changed);

    return { ...current, ...changed };
  });
}

/**
 * Which event series `/app` sends a teacher into (Q8). An archived one is not selectable, so a
 * remembered id that has since been archived or deleted falls back to the first series in the
 * teacher's order rather than to a page that would refuse to render.
 *
 * Null means there is nothing to select, which the caller answers with the event series list.
 */
export async function resolveSelectedEventSeriesId(preferredId?: string): Promise<string | null> {
  if (preferredId) {
    const preferred = await eventSeriesDoc(preferredId).get();
    if (preferred.exists && preferred.data()?.isArchived !== true) return preferred.id;
  }

  const selectable = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isArchived", "==", false)
    .get();

  const first = selectable.docs
    .map((doc) => ({ id: doc.id, position: Number(doc.data().position ?? 0) }))
    .sort((a, b) => a.position - b.position)[0];

  return first?.id ?? null;
}

/**
 * Everything belonging to one event series that Firestore will not take with the document.
 * A subcollection outlives its parent, and a token names its series by a field rather than by
 * its path, since a link carries the token and nothing else (US-23).
 */
async function sweepDependants(id: string): Promise<void> {
  const [registrations, savedReports, invitations] = await Promise.all([
    adminDb.collection(registrationPath(id)).get(),
    adminDb.collection(savedReportPath(id)).get(),
    adminDb.collection(COLLECTIONS.invitations).where("eventSeriesId", "==", id).get(),
  ]);

  const operations: BatchOperation[] = [
    ...registrations.docs,
    ...savedReports.docs,
    ...invitations.docs,
  ].map((doomed) => (batch) => batch.delete(doomed.ref));

  await commitInChunks(operations);
}

/**
 * Firestore has no cascading delete, so removal is explicit (US-4). Dependants go first and
 * the event series itself last: if the run fails midway the event series is still there, so simply calling
 * this again finishes the job. An event series is only ever unremovable while it still holds student
 * data and has not been archived — archiving is what signs off on data that must stay put; once
 * there are no registrations left to sign off on, the event series can go regardless of archive state.
 */
export async function deleteEventSeries(id: string): Promise<void> {
  const reference = eventSeriesDoc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);
  }

  const eventSeries = eventSeriesSchema.parse({ id, ...snapshot.data() });

  if (eventSeries.isTemplate && !eventSeries.isArchived) {
    const templates = await adminDb
      .collection(COLLECTIONS.eventSeries)
      .where("isTemplate", "==", true)
      .where("isArchived", "==", false)
      .get();
    if (templates.size <= 1) throw new ServiceError(ErrorCode.Conflict, LAST_TEMPLATE_HINT);
  }

  const registrationsSnapshot = await adminDb.collection(registrationPath(id)).get();

  if (!eventSeries.isArchived && !registrationsSnapshot.empty) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Eine Eventreihe mit Anmeldungen kann nur gelöscht werden, wenn sie archiviert ist.",
    );
  }

  // A registration carries its emergency contact and rentals in its own fields, so deleting it
  // takes them along, and the lists the series maintained are fields of the document itself and
  // go with it (US-21). What sweepDependants exists for is everything Firestore leaves standing.
  await sweepDependants(id);

  await reference.delete();

  // Again, because a write that began before this ran read a series that was still there and so
  // succeeded. Only now can nothing further be written: every such write reads the series first,
  // and it is gone. Children first and the series last is what keeps a failed run re-runnable,
  // and this second pass is what keeps a successful one total.
  await sweepDependants(id);
}
