/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { reorderCollection } from "@/lib/firebase/reorder";
import {
  normalizeName,
  releaseName,
  reservationRef,
  reserveName,
  scopeOf,
} from "@/lib/firebase/unique-name";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { namedListItemSchema, requiredEquipmentSchema } from "@/lib/schemas/master-data";
import {
  categoryOf,
  masterDataCategorySchema,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";
import { assertEquipmentNotInUse, assertNotInUse } from "./usage-guard";

const nameSchema = namedListItemSchema.shape.name;

export type MasterDataItem = { id: string; name: string; requiredEquipment?: string[] };

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

/**
 * Uniqueness within the program needs no reservation: the whole list lives in one document, so
 * the transaction that writes it already sees every sibling (US-5).
 */
function parseEquipment(category: MasterDataCategory, value: readonly string[]): string[] {
  if (category.equipmentField === undefined) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      "Diese Kategorie führt keine Ausrüstungsliste.",
    );
  }

  const parsed = requiredEquipmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      parsed.error.issues[0]?.message ?? "Ungültige Ausrüstungsliste.",
    );
  }
  return parsed.data;
}

function itemDoc(category: MasterDataCategory, id: string) {
  return adminDb.collection(category.collection).doc(id);
}

function equipmentOf(category: MasterDataCategory, data: Record<string, unknown> | undefined) {
  if (category.equipmentField === undefined) return undefined;

  const stored = data?.[category.equipmentField];
  return Array.isArray(stored) ? stored.filter((entry) => typeof entry === "string") : [];
}

function itemFrom(
  category: MasterDataCategory,
  id: string,
  data: Record<string, unknown> | undefined,
): MasterDataItem {
  const parsed = namedListItemSchema.safeParse({ id, ...data });
  if (!parsed.success) {
    throw new ServiceError(ErrorCode.InternalError, "Dieser Eintrag ist beschädigt.");
  }

  const requiredEquipment = equipmentOf(category, data);
  return requiredEquipment === undefined
    ? { id, name: parsed.data.name }
    : { id, name: parsed.data.name, requiredEquipment };
}

async function readItem(category: MasterDataCategory, id: string): Promise<MasterDataItem> {
  const snapshot = await itemDoc(category, id).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
  }
  return itemFrom(category, id, snapshot.data());
}

export async function createMasterDataItem(
  key: MasterDataCategoryKey,
  input: { name: string; requiredEquipment?: readonly string[] },
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = parseName(input.name);
  const equipment =
    category.equipmentField === undefined && input.requiredEquipment === undefined
      ? undefined
      : parseEquipment(category, input.requiredEquipment ?? []);

  // A new item goes to the end of the teacher's order (see Ordering). Read outside the
  // transaction: two simultaneous creates would tie, which the name tiebreak absorbs and the
  // next reorder renumbers away.
  const position = (await adminDb.collection(category.collection).get()).size;

  // The reservation is what makes the name unique; it shares the transaction with the record,
  // so a rejected name leaves nothing behind (US-5 to US-10).
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(category.collection).doc();
    await reserveName(transaction, {
      scope: scopeOf(category.collection),
      name,
      ownerId: reference.id,
    });

    const data =
      category.equipmentField === undefined
        ? { name, position }
        : { name, position, [category.equipmentField]: equipment as string[] };
    transaction.set(reference, data);

    return itemFrom(category, reference.id, data);
  });
}

/** Ordering touches no name, so it is deliberately not subject to the in-use guard (see Ordering). */
export async function reorderMasterDataItems(
  key: MasterDataCategoryKey,
  orderedIds: readonly string[],
): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  await reorderCollection({ collection: category.collection, orderedIds });
}

export type MasterDataUpdate = { name?: string; requiredEquipment?: readonly string[] };

/**
 * Renaming is gated by the in-use guard: master data records keep a plain-text snapshot of the
 * value they selected (US-11), so a rename would silently orphan every record still pointing at
 * the old text. Archiving the season is what releases the item again (US-5 to US-10).
 *
 * The equipment list is held to the same rule, one entry at a time: adding is always fine, but
 * an entry that disappears — removed outright or renamed away — must not be one a student of an
 * open season still rents. The list is rewritten whole, so the check is a set difference.
 *
 * Both guards run ahead of the transaction rather than inside it. They scan the master data of
 * every open season, and a transactional query locks the index range it scans — which is what
 * made an earlier sibling-query approach to unique names collapse under concurrency.
 */
export async function updateMasterDataItem(
  key: MasterDataCategoryKey,
  id: string,
  update: MasterDataUpdate,
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = update.name === undefined ? undefined : parseName(update.name);
  const equipment =
    update.requiredEquipment === undefined
      ? undefined
      : parseEquipment(category, update.requiredEquipment);

  const current = await readItem(category, id);

  if (name !== undefined) await assertNotInUse(category, current.name);

  if (equipment !== undefined) {
    const kept = new Set(equipment.map(normalizeName));
    const dropped = (current.requiredEquipment ?? []).filter(
      (entry) => !kept.has(normalizeName(entry)),
    );
    await assertEquipmentNotInUse(dropped);
  }

  return adminDb.runTransaction(async (transaction) => {
    const reference = itemDoc(category, id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
    }

    const stored = itemFrom(category, id, snapshot.data());
    const scope = scopeOf(category.collection);

    if (name !== undefined) {
      // Re-claiming its own name is how a case-only change stays legal: both spellings share one
      // reservation document, so releasing the old one would drop the claim entirely.
      await reserveName(transaction, { scope, name, ownerId: id });
      if (normalizeName(name) !== normalizeName(stored.name)) {
        releaseName(transaction, { scope, name: stored.name });
      }
    }

    const next = {
      ...(name === undefined ? {} : { name }),
      ...(equipment === undefined ? {} : { [category.equipmentField as string]: equipment }),
    };
    transaction.update(reference, next);

    return { ...stored, ...next } as MasterDataItem;
  });
}

/**
 * A program's required equipment goes with it, since the list lives on the program itself — so
 * the same restriction applies: an entry a student of an open season still rents cannot be
 * removed on its own, and deleting the program must not be a way around that. Master data
 * records keep their snapshots either way (US-11).
 */
export async function deleteMasterDataItem(key: MasterDataCategoryKey, id: string): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  const item = await readItem(category, id);
  await assertNotInUse(category, item.name);
  await assertEquipmentNotInUse(item.requiredEquipment ?? []);

  // Frees the name for reuse; otherwise a deleted item would keep blocking it.
  await adminDb
    .batch()
    .delete(reservationRef(scopeOf(category.collection), item.name))
    .delete(itemDoc(category, id))
    .commit();
}
