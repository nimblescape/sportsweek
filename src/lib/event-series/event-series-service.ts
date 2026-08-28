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
import { ARCHIVED_IS_READ_ONLY_HINT } from "@/lib/event-series/event-series-state";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
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
      isActive: false,
      isArchived: false,
      hasRegistrations: false,
      position,
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
  isActive?: boolean;
  isArchived?: boolean;
};

/**
 * At most one event series is active at any point in time (US-4). Every flag change therefore runs in
 * one transaction: activating an event series stands the previously active one down in the same commit,
 * so no window exists in which two are active — which would silently corrupt registrations,
 * assignment and the report (US-11 to US-13). The query is what makes this safe under
 * concurrency: Firestore locks the `isActive == true` index range it scans, so a second
 * activation racing the first has to wait and then sees the event series the first one activated.
 * Archiving is likewise gated: it signs off on an event series' registrations, so an event series with none
 * cannot be archived (US-4).
 */
export async function updateEventSeries(
  id: string,
  update: EventSeriesUpdate,
): Promise<EventSeries> {
  const name = update.name === undefined ? undefined : parseName(update.name);
  const wantsActivation = update.isActive === true;
  const wantsArchival = update.isArchived === true;

  return adminDb.runTransaction(async (transaction) => {
    const reference = eventSeriesDoc(id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
    }

    const current = eventSeriesSchema.parse({ id, ...snapshot.data() });
    const isArchived = update.isArchived ?? current.isArchived;
    const isActive = update.isActive ?? current.isActive;

    if (wantsActivation && isArchived) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine archivierte Eventreihe kann nicht aktiv gesetzt werden.",
      );
    }

    // An event series must be deactivated first, in its own call, before it can be archived (US-4).
    if (isArchived && isActive) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine aktive Eventreihe kann nicht archiviert werden. Bitte zuerst deaktivieren.",
      );
    }

    const renaming = name !== undefined && name !== current.name;

    // Archiving signs an event series off, so what it is called is settled with it: unarchive it first
    // and the name is editable again (US-4).
    if (renaming && current.isArchived) {
      throw new ServiceError(ErrorCode.Conflict, ARCHIVED_IS_READ_ONLY_HINT);
    }

    // Every read has to happen before the first write, and reserveName writes — so the query
    // that finds the outgoing event series has to run first. Every match is stood down rather than
    // just the first, so a database that somehow already held two active event series is repaired
    // by the next activation instead of staying broken.
    const previouslyActive = wantsActivation
      ? (
          await transaction.get(
            adminDb.collection(COLLECTIONS.eventSeries).where("isActive", "==", true),
          )
        ).docs.filter((doc) => doc.id !== id)
      : [];

    // Archiving finalises an event series, so it needs registrations to finalise (US-4). The query is
    // also what keeps the denormalized flag honest for clients, who cannot read
    // registration themselves (see firestore.rules).
    let hasRegistrations = current.hasRegistrations;
    if (wantsArchival) {
      const masterData = await transaction.get(
        adminDb.collection(COLLECTIONS.registrations).where("eventSeriesId", "==", id).limit(1),
      );
      if (masterData.empty) {
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

    // `update` rather than `set`: the document now also carries the six maintained lists (US-21),
    // and naming them here only to preserve them would drop the next one somebody adds.
    const changed = {
      name: name ?? current.name,
      nameKey: normalizeName(name ?? current.name),
      isActive,
      isArchived,
      hasRegistrations,
    };
    transaction.update(reference, changed);
    for (const doc of previouslyActive) transaction.update(doc.ref, { isActive: false });

    return { ...current, ...changed };
  });
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
    throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
  }

  const eventSeries = eventSeriesSchema.parse({ id, ...snapshot.data() });

  const masterDataSnapshot = await adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventSeriesId", "==", id)
    .get();

  if (!eventSeries.isArchived && !masterDataSnapshot.empty) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Eine Eventreihe mit Anmeldungen kann nur gelöscht werden, wenn sie archiviert ist.",
    );
  }

  const eventsSnapshot = await adminDb
    .collection(COLLECTIONS.events)
    .where("eventSeriesId", "==", id)
    .get();

  const doomed = eventsSnapshot.docs.map((event) => event.ref);

  // A registration carries its emergency contact and rentals in its own fields, so
  // deleting it takes them along — there is nothing hanging off it to clean up separately.
  doomed.push(...masterDataSnapshot.docs.map((record) => record.ref));

  const operations: BatchOperation[] = doomed.map((target) => (batch) => batch.delete(target));
  await commitInChunks(operations);

  await reference.delete();
}
