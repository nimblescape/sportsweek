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
import { eventSchema, seasonSchema, type Event } from "@/lib/schemas/season";

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

async function requireOpenSeason(seasonId: string) {
  const snapshot = await adminDb.collection(COLLECTIONS.seasons).doc(seasonId).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diese Saison gibt es nicht.");
  }

  const season = seasonSchema.parse({ id: seasonId, ...snapshot.data() });
  if (season.isArchived) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Zu einer archivierten Saison können keine Events hinzugefügt werden.",
    );
  }
}

export async function createEvent(input: { seasonId: string; name: string }): Promise<Event> {
  const name = parseName(input.name);
  await requireOpenSeason(input.seasonId);

  // A new event goes to the end of its season's order (see Ordering).
  const position = (
    await adminDb.collection(COLLECTIONS.events).where("seasonId", "==", input.seasonId).get()
  ).size;

  // Scoped to the season, so two seasons may both hold a "Montafon".
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.events).doc();
    await reserveName(transaction, {
      scope: scopeOf(COLLECTIONS.events, input.seasonId),
      name,
      ownerId: reference.id,
    });

    const data = { seasonId: input.seasonId, name, position };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
  });
}

/** Ordering is per season, so one season's list can never renumber another's (see Ordering). */
export async function reorderEvents(
  seasonId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await reorderCollection({
    collection: COLLECTIONS.events,
    orderedIds,
    scope: { field: "seasonId", value: seasonId },
  });
}

/** Only the name is editable — an event never moves between seasons (US-4). */
export async function updateEvent(id: string, update: { name: string }): Promise<Event> {
  const name = parseName(update.name);

  const reference = eventDoc(id);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
    }

    const current = eventSchema.parse({ id, ...snapshot.data() });

    const scope = scopeOf(COLLECTIONS.events, current.seasonId);
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
    .collection(COLLECTIONS.studentMasterData)
    .where("eventId", "==", id)
    .get();

  const operations: BatchOperation[] = assigned.docs.map(
    (record) => (batch) => batch.update(record.ref, { eventId: null }),
  );
  await commitInChunks(operations);

  // Frees the name for reuse; otherwise a deleted event would keep blocking it.
  const nameRef = reservationRef(scopeOf(COLLECTIONS.events, current.seasonId), current.name);
  await adminDb.batch().delete(nameRef).delete(reference).commit();
}
