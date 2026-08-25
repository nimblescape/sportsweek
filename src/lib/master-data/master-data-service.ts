/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import {
  normalizeName,
  releaseName,
  reservationRef,
  reserveName,
  scopeOf,
} from "@/lib/firebase/unique-name";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { namedListItemSchema } from "@/lib/schemas/master-data";
import {
  categoryOf,
  masterDataCategorySchema,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";
import { assertNotInUse } from "./usage-guard";

const nameSchema = namedListItemSchema.shape.name;

export type MasterDataItem = { id: string; name: string; parentId: string | null };

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

function itemDoc(category: MasterDataCategory, id: string) {
  return adminDb.collection(category.collection).doc(id);
}

/** Flat lists are unique category-wide; a nested list only within its own parent (US-5). */
function scopeFor(category: MasterDataCategory, parentId: string | null): string {
  return category.parentField === undefined
    ? scopeOf(category.collection)
    : scopeOf(category.collection, parentId ?? "");
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

  const parentId =
    category.parentField === undefined ? null : String(data?.[category.parentField] ?? "");
  return { id, name: parsed.data.name, parentId: parentId === "" ? null : parentId };
}

async function readItem(category: MasterDataCategory, id: string): Promise<MasterDataItem> {
  const snapshot = await itemDoc(category, id).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
  }
  return itemFrom(category, id, snapshot.data());
}

async function requireParent(category: MasterDataCategory, parentId: string | undefined) {
  if (category.parentField === undefined) return null;

  if (!parentId) {
    throw new ServiceError(ErrorCode.ValidationError, "Es fehlt der übergeordnete Eintrag.");
  }

  // The only parent a nested list currently has is a program (US-5).
  const parent = await adminDb.collection(categoryOf("programs").collection).doc(parentId).get();
  if (!parent.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen übergeordneten Eintrag gibt es nicht.");
  }
  return parentId;
}

export async function createMasterDataItem(
  key: MasterDataCategoryKey,
  input: { name: string; parentId?: string },
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = parseName(input.name);
  const parentId = await requireParent(category, input.parentId);

  // The reservation is what makes the name unique; it shares the transaction with the record,
  // so a rejected name leaves nothing behind (US-5 to US-10).
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(category.collection).doc();
    await reserveName(transaction, {
      scope: scopeFor(category, parentId),
      name,
      ownerId: reference.id,
    });

    const data =
      category.parentField === undefined
        ? { name }
        : { name, [category.parentField]: parentId as string };
    transaction.set(reference, data);

    return { id: reference.id, name, parentId };
  });
}

/**
 * Renaming is gated by the in-use guard: master data records keep a plain-text snapshot of the
 * value they selected (US-11), so a rename would silently orphan every record still pointing at
 * the old text. Archiving the season is what releases the item again (US-5 to US-10).
 *
 * The guard runs ahead of the transaction rather than inside it. It has to scan the master data
 * of every open season, and a transactional query locks the index range it scans — which is what
 * made an earlier sibling-query approach to unique names collapse under concurrency.
 */
export async function updateMasterDataItem(
  key: MasterDataCategoryKey,
  id: string,
  update: { name: string },
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = parseName(update.name);

  const current = await readItem(category, id);
  await assertNotInUse(category, current.name);

  return adminDb.runTransaction(async (transaction) => {
    const reference = itemDoc(category, id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
    }

    const stored = itemFrom(category, id, snapshot.data());
    const scope = scopeFor(category, stored.parentId);

    // Re-claiming its own name is how a case-only change stays legal: both spellings share one
    // reservation document, so releasing the old one would drop the claim entirely.
    await reserveName(transaction, { scope, name, ownerId: id });
    if (normalizeName(name) !== normalizeName(stored.name)) {
      releaseName(transaction, { scope, name: stored.name });
    }

    transaction.update(reference, { name });
    return { ...stored, name };
  });
}

/**
 * Firestore has no cascading delete, so a program's required equipment goes first and the
 * program itself last: a run that fails midway leaves the program in place, so calling this
 * again finishes the job. Master data records keep their snapshots either way (US-11).
 */
export async function deleteMasterDataItem(key: MasterDataCategoryKey, id: string): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  const item = await readItem(category, id);
  await assertNotInUse(category, item.name);

  const doomed = [reservationRef(scopeFor(category, item.parentId), item.name)];

  if (category.childKey !== undefined) {
    const child = categoryOf(category.childKey as MasterDataCategoryKey);
    const children = await adminDb
      .collection(child.collection)
      .where(child.parentField as string, "==", id)
      .get();

    for (const document of children.docs) {
      doomed.push(document.ref);
      const childName = document.data()?.name;
      // Frees the name as well, otherwise it stays claimed by a record that no longer exists.
      if (typeof childName === "string") {
        doomed.push(reservationRef(scopeOf(child.collection, id), childName));
      }
    }
  }

  const operations: BatchOperation[] = doomed.map((target) => (batch) => batch.delete(target));
  await commitInChunks(operations);

  await itemDoc(category, id).delete();
}
