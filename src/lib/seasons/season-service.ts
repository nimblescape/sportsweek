import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
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

  // The reservation is what makes the name unique; it shares the transaction with the
  // record, so a rejected name leaves nothing behind (US-4).
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.seasons).doc();
    await reserveName(transaction, {
      scope: scopeOf(COLLECTIONS.seasons),
      name,
      ownerId: reference.id,
    });

    const data = { name, isActive: false, isArchived: false };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
  });
}

export type SeasonUpdate = {
  name?: string;
  isActive?: boolean;
  isArchived?: boolean;
};

/**
 * Every flag change runs in one transaction, because activating a season has to clear the
 * previously active one atomically — two independent writes could leave two seasons active,
 * which would silently corrupt master data, assignment and the report (US-4, US-11 to US-13).
 */
export async function updateSeason(id: string, update: SeasonUpdate): Promise<Season> {
  const name = update.name === undefined ? undefined : parseName(update.name);
  const wantsActivation = update.isActive === true;

  return adminDb.runTransaction(async (transaction) => {
    const reference = seasonDoc(id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Saison gibt es nicht.");
    }

    const current = seasonSchema.parse({ id, ...snapshot.data() });
    const isArchived = update.isArchived ?? current.isArchived;

    if (wantsActivation && isArchived) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine archivierte Saison kann nicht aktiv gesetzt werden.",
      );
    }

    // Archiving always stands the season down, so the invariant holds without a second call.
    const isActive = isArchived ? false : (update.isActive ?? current.isActive);

    // Every read has to happen before the first write in a transaction.
    const renaming = name !== undefined && name !== current.name;
    if (renaming) {
      await reserveName(transaction, {
        scope: scopeOf(COLLECTIONS.seasons),
        name,
        ownerId: id,
      });
    }

    const previouslyActive = wantsActivation
      ? (
          await transaction.get(
            adminDb.collection(COLLECTIONS.seasons).where("isActive", "==", true),
          )
        ).docs.filter((doc) => doc.id !== id)
      : [];

    const next = { name: name ?? current.name, isActive, isArchived };
    if (renaming)
      releaseName(transaction, { scope: scopeOf(COLLECTIONS.seasons), name: current.name });
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
 * the season itself last: if the run fails midway the season is still there and still archived,
 * so simply calling this again finishes the job.
 */
export async function deleteSeason(id: string): Promise<void> {
  const reference = seasonDoc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diese Saison gibt es nicht.");
  }

  const season = seasonSchema.parse({ id, ...snapshot.data() });
  if (!season.isArchived) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Nur archivierte Saisonen können gelöscht werden. Archiviere die Saison zuerst.",
    );
  }

  const masterDataSnapshot = await adminDb
    .collection(COLLECTIONS.studentMasterData)
    .where("seasonId", "==", id)
    .get();

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
