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
import { eventSchema, seasonSchema, type Season } from "@/lib/schemas/season";
import { studentMasterDataSchema } from "@/lib/schemas/student-master-data";
import { activeSeasonOf, NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";

/** The two answers the assignment turns on, derived so a rename cannot pass this by. */
const assignableSchema = studentMasterDataSchema.pick({
  seasonId: true,
  isAttendingSportsWeek: true,
});

async function requireActiveSeason(): Promise<Season> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.seasons)
    .where("isActive", "==", true)
    .get();

  const active = activeSeasonOf(
    snapshot.docs.map((season) => seasonSchema.parse({ id: season.id, ...season.data() })),
  );

  if (!active) throw new ServiceError(ErrorCode.Conflict, NO_ACTIVE_SEASON_HINT);
  return active;
}

async function requireEventOfSeason(eventId: string, seasonId: string): Promise<void> {
  const snapshot = await adminDb.collection(COLLECTIONS.events).doc(eventId).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
  }

  const event = eventSchema.parse({ id: eventId, ...snapshot.data() });
  if (event.seasonId !== seasonId) {
    throw new ServiceError(ErrorCode.Conflict, "Dieses Event gehört nicht zur aktiven Saison.");
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
  const season = await requireActiveSeason();
  if (eventId !== null) await requireEventOfSeason(eventId, season.id);

  const references = recordIds.map((recordId) =>
    adminDb.collection(COLLECTIONS.studentMasterData).doc(recordId),
  );

  // All in flight together. Read one after the other, moving a class was as many round trips as
  // it had students, which is seconds of waiting for a single drop.
  const snapshots = await Promise.all(references.map((reference) => reference.get()));

  const operations: BatchOperation[] = snapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Anmeldung gibt es nicht.");
    }

    const record = assignableSchema.parse(snapshot.data());
    if (record.seasonId !== season.id) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Nur Anmeldungen der aktiven Saison können zugeteilt werden.",
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
