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
import { seasonSchema, type Season } from "@/lib/schemas/season";

const nameSchema = seasonSchema.shape.name;

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

function seasonDoc(id: string) {
  return adminDb.collection(COLLECTIONS.seasons).doc(id);
}

export async function createSeason(input: { name: string }): Promise<Season> {
  const name = parseName(input.name);

  // A new season goes to the end of the teacher's order (see Ordering).
  const position = (await adminDb.collection(COLLECTIONS.seasons).get()).size;

  // The reservation is what makes the name unique; it shares the transaction with the
  // record, so a rejected name leaves nothing behind (US-4).
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.seasons).doc();
    await reserveName(transaction, {
      scope: scopeOf(COLLECTIONS.seasons),
      name,
      ownerId: reference.id,
    });

    const data = { name, isActive: false, isArchived: false, hasStudentData: false, position };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
  });
}

/** Ordering touches no name or flag, so it needs none of the guards the other writes carry. */
export async function reorderSeasons(orderedIds: readonly string[]): Promise<void> {
  await reorderCollection({ collection: COLLECTIONS.seasons, orderedIds });
}

export type SeasonUpdate = {
  name?: string;
  isActive?: boolean;
  isArchived?: boolean;
};

/**
 * At most one season is active at any point in time (US-4). Every flag change therefore runs in
 * one transaction: activating a season stands the previously active one down in the same commit,
 * so no window exists in which two are active — which would silently corrupt master data,
 * assignment and the report (US-11 to US-13). The query is what makes this safe under
 * concurrency: Firestore locks the `isActive == true` index range it scans, so a second
 * activation racing the first has to wait and then sees the season the first one activated.
 * Archiving is likewise gated: it signs off on a season's student data, so a season with none
 * cannot be archived (US-4).
 */
export async function updateSeason(id: string, update: SeasonUpdate): Promise<Season> {
  const name = update.name === undefined ? undefined : parseName(update.name);
  const wantsActivation = update.isActive === true;
  const wantsArchival = update.isArchived === true;

  return adminDb.runTransaction(async (transaction) => {
    const reference = seasonDoc(id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Saison gibt es nicht.");
    }

    const current = seasonSchema.parse({ id, ...snapshot.data() });
    const isArchived = update.isArchived ?? current.isArchived;
    const isActive = update.isActive ?? current.isActive;

    if (wantsActivation && isArchived) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine archivierte Saison kann nicht aktiv gesetzt werden.",
      );
    }

    // A season must be deactivated first, in its own call, before it can be archived (US-4).
    if (isArchived && isActive) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine aktive Saison kann nicht archiviert werden. Bitte zuerst deaktivieren.",
      );
    }

    const renaming = name !== undefined && name !== current.name;

    // Every read has to happen before the first write, and reserveName writes — so the query
    // that finds the outgoing season has to run first. Every match is stood down rather than
    // just the first, so a database that somehow already held two active seasons is repaired
    // by the next activation instead of staying broken.
    const previouslyActive = wantsActivation
      ? (
          await transaction.get(
            adminDb.collection(COLLECTIONS.seasons).where("isActive", "==", true),
          )
        ).docs.filter((doc) => doc.id !== id)
      : [];

    // Archiving finalises a season, so it needs student data to finalise (US-4). The query is
    // also what keeps the denormalized flag honest for clients, who cannot read
    // studentMasterData themselves (see firestore.rules).
    let hasStudentData = current.hasStudentData;
    if (wantsArchival) {
      const masterData = await transaction.get(
        adminDb.collection(COLLECTIONS.studentMasterData).where("seasonId", "==", id).limit(1),
      );
      if (masterData.empty) {
        throw new ServiceError(
          ErrorCode.Conflict,
          "Eine Saison ohne Schülerdaten kann nicht archiviert werden.",
        );
      }
      hasStudentData = true;
    }

    if (renaming) {
      await reserveName(transaction, {
        scope: scopeOf(COLLECTIONS.seasons),
        name,
        ownerId: id,
      });
      releaseName(transaction, { scope: scopeOf(COLLECTIONS.seasons), name: current.name });
    }

    // `set` replaces the document, so the teacher's ordering has to be carried across.
    const next = {
      name: name ?? current.name,
      isActive,
      isArchived,
      hasStudentData,
      position: current.position,
    };
    transaction.set(reference, next);
    for (const doc of previouslyActive) transaction.update(doc.ref, { isActive: false });

    return { id, ...next };
  });
}

async function referencesOf(collection: string, field: string, value: string) {
  const snapshot = await adminDb.collection(collection).where(field, "==", value).get();
  return snapshot.docs.map((doc) => doc.ref);
}

/**
 * Firestore has no cascading delete, so removal is explicit (US-4). Dependants go first and
 * the season itself last: if the run fails midway the season is still there, so simply calling
 * this again finishes the job. A season is only ever unremovable while it still holds student
 * data and has not been archived — archiving is what signs off on data that must stay put; once
 * there is no student data left to sign off on, the season can go regardless of archive state.
 */
export async function deleteSeason(id: string): Promise<void> {
  const reference = seasonDoc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diese Saison gibt es nicht.");
  }

  const season = seasonSchema.parse({ id, ...snapshot.data() });

  const masterDataSnapshot = await adminDb
    .collection(COLLECTIONS.studentMasterData)
    .where("seasonId", "==", id)
    .get();

  if (!season.isArchived && !masterDataSnapshot.empty) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Eine Saison mit Schülerdaten kann nur gelöscht werden, wenn sie archiviert ist.",
    );
  }

  const eventsSnapshot = await adminDb
    .collection(COLLECTIONS.events)
    .where("seasonId", "==", id)
    .get();

  const doomed = eventsSnapshot.docs.map((event) => event.ref);

  // Free the names as well, otherwise they stay claimed by records that no longer exist.
  doomed.push(reservationRef(scopeOf(COLLECTIONS.seasons), season.name));
  for (const event of eventsSnapshot.docs) {
    const eventName = event.data().name;
    if (typeof eventName === "string") {
      doomed.push(reservationRef(scopeOf(COLLECTIONS.events, id), eventName));
    }
  }

  for (const record of masterDataSnapshot.docs) {
    doomed.push(
      ...(await referencesOf(COLLECTIONS.emergencyContacts, "studentMasterDataId", record.id)),
      ...(await referencesOf(COLLECTIONS.equipmentRentalItems, "studentMasterDataId", record.id)),
    );
  }
  doomed.push(...masterDataSnapshot.docs.map((record) => record.ref));

  const operations: BatchOperation[] = doomed.map((target) => (batch) => batch.delete(target));
  await commitInChunks(operations);

  await reference.delete();
}
