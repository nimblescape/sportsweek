/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { reorderCollection } from "@/lib/firebase/reorder";
import { releaseName, reservationRef, reserveName, scopeOf } from "@/lib/firebase/unique-name";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSchema, eventSeriesSchema, type Event } from "@/lib/schemas/event-series";

const nameSchema = eventSchema.shape.name;

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

function eventDoc(id: string) {
  return adminDb.collection(COLLECTIONS.events).doc(id);
}

async function requireOpenEventSeries(eventSeriesId: string) {
  const snapshot = await adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
  }

  const eventSeries = eventSeriesSchema.parse({ id: eventSeriesId, ...snapshot.data() });
  if (eventSeries.isArchived) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Zu einer archivierten Eventreihe können keine Events hinzugefügt werden.",
    );
  }
}

export async function createEvent(input: { eventSeriesId: string; name: string }): Promise<Event> {
  const name = parseName(input.name);
  await requireOpenEventSeries(input.eventSeriesId);

  // A new event goes to the end of its event series' order (see Ordering).
  const position = (
    await adminDb
      .collection(COLLECTIONS.events)
      .where("eventSeriesId", "==", input.eventSeriesId)
      .count()
      .get()
  ).data().count;

  // Scoped to the event series, so two event series may both hold a "Montafon".
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.events).doc();
    await reserveName(transaction, {
      scope: scopeOf(COLLECTIONS.events, input.eventSeriesId),
      name,
      ownerId: reference.id,
    });

    const data = { eventSeriesId: input.eventSeriesId, name, position };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
  });
}

/** Ordering is per event series, so one event series' list can never renumber another's (see Ordering). */
export async function reorderEvents(
  eventSeriesId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await reorderCollection({
    collection: COLLECTIONS.events,
    orderedIds,
    scope: { field: "eventSeriesId", value: eventSeriesId },
  });
}

/** Only the name is editable — an event never moves between event series (US-4). */
export async function updateEvent(id: string, update: { name: string }): Promise<Event> {
  const name = parseName(update.name);

  const reference = eventDoc(id);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
    }

    const current = eventSchema.parse({ id, ...snapshot.data() });

    const scope = scopeOf(COLLECTIONS.events, current.eventSeriesId);
    if (name !== current.name) {
      await reserveName(transaction, { scope, name, ownerId: id });
      releaseName(transaction, { scope, name: current.name });
    }

    transaction.update(reference, { name });
    return { ...current, name };
  });
}

/**
 * Clearing `eventId` happens before the event disappears, so a failed run leaves records
 * pointing at an event that still exists rather than at a ghost (US-4, US-12).
 */
export async function deleteEvent(id: string): Promise<void> {
  const reference = eventDoc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
  }

  const current = eventSchema.parse({ id, ...snapshot.data() });

  const assigned = await adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventId", "==", id)
    .get();

  const operations: BatchOperation[] = assigned.docs.map(
    (record) => (batch) => batch.update(record.ref, { eventId: null }),
  );
  await commitInChunks(operations);

  // Frees the name for reuse; otherwise a deleted event would keep blocking it.
  const nameRef = reservationRef(scopeOf(COLLECTIONS.events, current.eventSeriesId), current.name);
  await adminDb.batch().delete(nameRef).delete(reference).commit();
}
