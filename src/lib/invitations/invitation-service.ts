/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import {
  ARCHIVED_IS_READ_ONLY_HINT,
  NO_SUCH_EVENT_SERIES,
  classIsOpen,
} from "@/lib/event-series/event-series-state";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import type { ClassOption } from "@/lib/schemas/master-data";
import { invitationSchema, type Invitation } from "@/lib/schemas/invitation";
import { normalizeName } from "@/lib/firebase/name-key";
import { narrowedClasses } from "@/lib/assignment/class-narrowing";
import type { Uid } from "@/lib/schemas/common";

/**
 * 32 bytes of entropy, base64url so it survives a URL and a QR code unescaped. Guessing is not a
 * strategy against this, which is what lets the token stand in for the series id in a link that
 * tells its holder nothing about any other (US-23).
 */
const TOKEN_BYTES = 32;

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function invitationDoc(token: string) {
  return adminDb.collection(COLLECTIONS.invitations).doc(token);
}

/**
 * Only a class the reader's own page offers may be acted on this way (US-39, US-43): refused
 * rather than narrowed, so a request naming one outside it is reported instead of quietly
 * dropped. `null` widens rather than restricts — a caller looking after nothing here, or none at
 * all, is treated as unscoped, the same direction `narrowedClasses` already takes everywhere else.
 */
function assertClassInScope(
  classOptions: readonly ClassOption[],
  className: string,
  teacherUid: Uid | null,
): void {
  const allowed = narrowedClasses(classOptions, teacherUid);
  if (
    allowed !== null &&
    !allowed.some((name) => normalizeName(name) === normalizeName(className))
  ) {
    throw new ServiceError(ErrorCode.PermissionDenied, "Dafür fehlen dir die Rechte.");
  }
}

/**
 * Whether a class already has a live link (US-43). Read-only, and kept apart from the write that
 * follows it: a Firestore transaction refuses a read once any write has been issued, so opening
 * several classes at once has to finish asking before it starts minting.
 */
async function invitationExists(
  transaction: Transaction,
  eventSeriesId: string,
  className: string,
): Promise<boolean> {
  const existing = await transaction.get(
    adminDb
      .collection(COLLECTIONS.invitations)
      .where("eventSeriesId", "==", eventSeriesId)
      .where("class", "==", className),
  );
  return !existing.empty;
}

/**
 * Generates a class's link, replacing whichever one it had (US-23). Regenerating invalidates only
 * that class's previous token, and evicts nobody: the students who already used it keep their
 * registrations and reach them by signing in.
 *
 * Leaves the window alone either way (Q8, Q11): copying and regenerating hand out an address,
 * they do not decide who may use it. A series that cannot be edited at all has no link to hand
 * out either, which is why an archived series is refused here rather than at a second control.
 */
export async function createInvitation(
  eventSeriesId: string,
  className: string,
  teacherUid: Uid | null = null,
): Promise<Invitation> {
  const token = newToken();

  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
    const stored = await transaction.get(reference);
    if (!stored.exists) {
      throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);
    }

    const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
    if (series.isArchived) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine archivierte Eventreihe kann nicht bearbeitet werden.",
      );
    }

    // The link names a class the series actually offers, so a stale page cannot enrol a room
    // full of students into one that has since been renamed away (US-23, US-24).
    const offered = series.classOptions.find(
      (candidate) => normalizeName(candidate.name) === normalizeName(className),
    );
    if (offered === undefined) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Klasse gibt es nicht.");
    }
    assertClassInScope(series.classOptions, offered.name, teacherUid);

    const previous = await transaction.get(
      adminDb
        .collection(COLLECTIONS.invitations)
        .where("eventSeriesId", "==", eventSeriesId)
        .where("class", "==", offered.name),
    );

    for (const stale of previous.docs) transaction.delete(stale.ref);
    transaction.set(invitationDoc(token), { eventSeriesId, class: offered.name });

    return { token, eventSeriesId, class: offered.name };
  });
}

/**
 * What a link leads to, or null where it leads nowhere — mistyped, superseded by a regenerated
 * one, or naming a class that is not currently open. The caller says the one sentence US-23 gives
 * for all of those, so that none of them can be told apart.
 */
export async function resolveInvitation(token: string): Promise<Invitation | null> {
  const stored = await invitationDoc(token).get();
  if (!stored.exists) return null;

  const invitation = invitationSchema.safeParse({ token, ...stored.data() });
  if (!invitation.success) return null;

  const series = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .doc(invitation.data.eventSeriesId)
    .get();
  if (!series.exists) return null;

  const parsed = eventSeriesSchema.safeParse({ id: series.id, ...series.data() });
  if (!parsed.success || !classIsOpen(parsed.data.classOptions, invitation.data.class)) {
    return null;
  }

  return invitation.data;
}

/**
 * The links a series currently has, one per class that has been invited (US-23, US-29).
 *
 * Read with the Admin SDK and answered only to a teacher, which is what "readable by nobody"
 * means: no access rule hands a token out, because a rule grants a whole document to everyone it
 * grants it to. A teacher needs them back so that copying a link twice copies the same link —
 * regenerating is a decision, not a side effect of pressing a button again.
 */
export async function invitationsOf(eventSeriesId: string): Promise<Invitation[]> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.invitations)
    .where("eventSeriesId", "==", eventSeriesId)
    .get();

  return snapshot.docs
    .map((stored) => invitationSchema.safeParse({ token: stored.id, ...stored.data() }))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}

/**
 * Opens or closes one class of a series (US-43) — the card's one toggle, and the only thing that
 * moves the window. Opening mints a link where the class has none yet, since a class may never
 * be open without one (Q8); it reuses whichever it already holds otherwise. Closing only ever
 * flips the flag: the link stays valid and evicts nobody.
 */
export async function setClassOpen(
  eventSeriesId: string,
  className: string,
  isOpenToStudents: boolean,
  teacherUid: Uid | null = null,
): Promise<ClassOption> {
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
    const stored = await transaction.get(reference);
    if (!stored.exists) throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);

    const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
    if (series.isArchived) {
      throw new ServiceError(ErrorCode.Conflict, ARCHIVED_IS_READ_ONLY_HINT);
    }

    const index = series.classOptions.findIndex(
      (candidate) => normalizeName(candidate.name) === normalizeName(className),
    );
    if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Diese Klasse gibt es nicht.");
    const target = series.classOptions[index]!;
    assertClassInScope(series.classOptions, target.name, teacherUid);

    const needsLink =
      isOpenToStudents && !(await invitationExists(transaction, eventSeriesId, target.name));
    if (needsLink) {
      transaction.set(invitationDoc(newToken()), { eventSeriesId, class: target.name });
    }

    const classOptions = series.classOptions.map((option, at) =>
      at === index ? { ...option, isOpenToStudents } : option,
    );
    transaction.update(reference, { classOptions });

    return classOptions[index]!;
  });
}

/**
 * Opens or closes every class of a series at once — the header door's one action (US-44). Not
 * yet narrowed to the classes a teacher looks after (US-39): that scoping is the next slice's own
 * job, built on this one act.
 */
export async function setEveryClassOpen(
  eventSeriesId: string,
  isOpenToStudents: boolean,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
    const stored = await transaction.get(reference);
    if (!stored.exists) throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);

    const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
    if (series.isArchived) {
      throw new ServiceError(ErrorCode.Conflict, ARCHIVED_IS_READ_ONLY_HINT);
    }

    // Reads finish before any write is issued (see `invitationExists`), so which classes need a
    // fresh link is decided for all of them before the first one is minted.
    const needsLink: string[] = [];
    if (isOpenToStudents) {
      for (const option of series.classOptions) {
        if (!(await invitationExists(transaction, eventSeriesId, option.name))) {
          needsLink.push(option.name);
        }
      }
    }

    for (const className of needsLink) {
      transaction.set(invitationDoc(newToken()), { eventSeriesId, class: className });
    }

    transaction.update(reference, {
      classOptions: series.classOptions.map((option) => ({ ...option, isOpenToStudents })),
    });
  });
}
