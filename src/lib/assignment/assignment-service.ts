/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSchema, eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { registrationSchema } from "@/lib/schemas/registration";
import {
  activeEventSeriesOf,
  NO_ACTIVE_EVENT_SERIES_HINT,
} from "@/lib/event-series/event-series-state";

/** The two answers the assignment turns on, derived so a rename cannot pass this by. */
const assignableSchema = registrationSchema.pick({
  eventSeriesId: true,
  isAttendingSportsWeek: true,
});

async function requireActiveEventSeries(): Promise<EventSeries> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isActive", "==", true)
    .get();

  const active = activeEventSeriesOf(
    snapshot.docs.map((eventSeries) =>
      eventSeriesSchema.parse({ id: eventSeries.id, ...eventSeries.data() }),
    ),
  );

  if (!active) throw new ServiceError(ErrorCode.Conflict, NO_ACTIVE_EVENT_SERIES_HINT);
  return active;
}

async function requireEventOfEventSeries(eventId: string, eventSeriesId: string): Promise<void> {
  const snapshot = await adminDb.collection(COLLECTIONS.events).doc(eventId).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
  }

  const event = eventSchema.parse({ id: eventId, ...snapshot.data() });
  if (event.eventSeriesId !== eventSeriesId) {
    throw new ServiceError(ErrorCode.Conflict, "Dieses Event gehört nicht zur aktiven Eventreihe.");
  }
}

/**
 * The teacher's half of US-12: `eventId` is theirs to set, which is why the student's own save
 * carries it forward untouched and why no client may write this collection (see firestore.rules).
 *
 * Every record is checked before any of them is written, so a selection containing one student
 * who may not be assigned leaves the others where they were rather than moving half of them.
 * Assigning is refused for a student who answered "no" — only someone who is coming can be —
 * while unassigning one stays allowed, so a student who changes their mind after being assigned
 * cannot get stuck in an event.
 */
export async function assignStudents(
  recordIds: readonly string[],
  eventId: string | null,
): Promise<void> {
  const eventSeries = await requireActiveEventSeries();
  if (eventId !== null) await requireEventOfEventSeries(eventId, eventSeries.id);

  const references = recordIds.map((recordId) =>
    adminDb.collection(COLLECTIONS.registrations).doc(recordId),
  );

  // All in flight together. Read one after the other, moving a class was as many round trips as
  // it had students, which is seconds of waiting for a single drop.
  const snapshots = await Promise.all(references.map((reference) => reference.get()));

  const operations: BatchOperation[] = snapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Anmeldung gibt es nicht.");
    }

    const record = assignableSchema.parse(snapshot.data());
    if (record.eventSeriesId !== eventSeries.id) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Nur Anmeldungen der aktiven Eventreihe können zugeteilt werden.",
      );
    }
    if (eventId !== null && !record.isAttendingSportsWeek) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Wer nicht teilnimmt, kann keinem Event zugeteilt werden.",
      );
    }

    return (batch) => batch.update(references[index], { eventId });
  });

  await commitInChunks(operations);
}
