import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { assertNameIsFree } from "@/lib/firebase/unique-name";
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

  // A name only has to be unique within its season, so two seasons may both hold a "Montafon".
  return adminDb.runTransaction(async (transaction) => {
    await assertNameIsFree(transaction, {
      collection: COLLECTIONS.events,
      name,
      scope: { field: "seasonId", value: input.seasonId },
    });

    const reference = adminDb.collection(COLLECTIONS.events).doc();
    const data = { seasonId: input.seasonId, name };
    transaction.set(reference, data);
    return { id: reference.id, ...data };
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

    if (name !== current.name) {
      await assertNameIsFree(transaction, {
        collection: COLLECTIONS.events,
        name,
        scope: { field: "seasonId", value: current.seasonId },
        exceptId: id,
      });
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

  const assigned = await adminDb
    .collection(COLLECTIONS.studentMasterData)
    .where("eventId", "==", id)
    .get();

  const operations: BatchOperation[] = assigned.docs.map(
    (record) => (batch) => batch.update(record.ref, { eventId: null }),
  );
  await commitInChunks(operations);

  await reference.delete();
}
