/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { registrationPath } from "@/lib/registration/registration";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { registrationSchema } from "@/lib/schemas/registration";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";

/** The one answer the assignment turns on, derived so a rename cannot pass this by. */
const assignableSchema = registrationSchema.pick({ isAttendingSportsWeek: true });

/**
 * The series the teacher is working in, named by the path (Q8). Archived is refused because
 * archiving is what makes a series read-only, and there is no screen it could be assigned from.
 */
async function requireEventSeries(eventSeriesId: string): Promise<EventSeries> {
  const stored = await adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId).get();
  const parsed = stored.exists
    ? eventSeriesSchema.safeParse({ id: stored.id, ...stored.data() })
    : null;

  if (!parsed?.success || parsed.data.isArchived) {
    throw new ServiceError(ErrorCode.Conflict, NO_EVENT_SERIES_HINT);
  }
  return parsed.data;
}

/**
 * The event as the series spells it. An assignment holds the name rather than a reference
 * (US-11, US-21), so a name the series does not offer would write a value nothing can show and
 * no filter can reach — it is refused instead. Matching is the comparison names are always
 * given, and the answer is the stored spelling, so a caller working from a stale list writes
 * what the list says now or nothing at all.
 */
function eventOfEventSeries(eventSeries: EventSeries, event: string): string {
  const wanted = normalizeName(event);
  const offered = eventSeries.events.find((candidate) => normalizeName(candidate) === wanted);

  if (offered === undefined) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es in dieser Eventreihe nicht.");
  }
  return offered;
}

/**
 * The teacher's half of US-12: the event assignment is theirs to set, which is why the student's
 * own save carries it forward untouched and why no client may write this collection (see
 * firestore.rules).
 *
 * Every record is checked before any of them is written, so a selection containing one student
 * who may not be assigned leaves the others where they were rather than moving half of them.
 * Assigning is refused for a student who answered "no" — only someone who is coming can be —
 * while unassigning one stays allowed, so a student who changes their mind after being assigned
 * cannot get stuck in an event.
 */
export async function assignStudents(
  eventSeriesId: string,
  studentUids: readonly string[],
  event: string | null,
): Promise<void> {
  const eventSeries = await requireEventSeries(eventSeriesId);
  const assigned = event === null ? null : eventOfEventSeries(eventSeries, event);

  // Beneath that series by construction, so "is this registration one of ours?" is the path
  // rather than a field a caller could point elsewhere (US-26).
  const references = studentUids.map((studentUid) =>
    adminDb.collection(registrationPath(eventSeries.id)).doc(studentUid),
  );

  // All in flight together. Read one after the other, moving a class was as many round trips as
  // it had students, which is seconds of waiting for a single drop.
  const snapshots = await Promise.all(references.map((reference) => reference.get()));

  const operations: BatchOperation[] = snapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Registrierung gibt es nicht.");
    }

    const record = assignableSchema.parse(snapshot.data());
    if (assigned !== null && !record.isAttendingSportsWeek) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Wer nicht teilnimmt, kann keinem Event zugeteilt werden.",
      );
    }

    return (batch) => batch.update(references[index], { event: assigned });
  });

  await commitInChunks(operations);
}
