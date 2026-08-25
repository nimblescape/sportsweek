/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/unique-name";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { IN_USE_HINT, type MasterDataCategory } from "./categories";

/**
 * Master data records of seasons that are still open. Archiving is what signs a season's data
 * off (US-4), so it is the season's flag — never a flag on the record — that decides whether the
 * values it snapshotted are still binding (US-5 to US-10).
 */
async function openRecords() {
  const seasons = await adminDb
    .collection(COLLECTIONS.seasons)
    .where("isArchived", "==", false)
    .get();

  const perSeason = await Promise.all(
    seasons.docs.map((season) =>
      adminDb.collection(COLLECTIONS.studentMasterData).where("seasonId", "==", season.id).get(),
    ),
  );

  return perSeason.flatMap((snapshot) => snapshot.docs);
}

/**
 * The names an editing teacher may not touch, normalized for comparison.
 *
 * The lists store names, and so do the records that select from them — master data keeps a
 * plain-text snapshot rather than a reference (US-11), which is exactly why this is a name
 * match and not a join.
 */
export async function namesInUse(category: MasterDataCategory): Promise<Set<string>> {
  const records = await openRecords();

  if (category.usage.kind === "masterData") {
    const field = category.usage.field;
    return new Set(
      records.flatMap((record) => {
        const value = record.data()?.[field];
        return typeof value === "string" && value.trim() !== "" ? [normalizeName(value)] : [];
      }),
    );
  }

  // Required equipment is chosen per student, so it is the rental rows that mark an item as
  // used — never the program the item belongs to (US-5).
  const rentals = await Promise.all(
    records.map((record) =>
      adminDb
        .collection(COLLECTIONS.equipmentRentalItems)
        .where("studentMasterDataId", "==", record.id)
        .get(),
    ),
  );

  return new Set(
    rentals.flatMap((snapshot) =>
      snapshot.docs.flatMap((rental) => {
        const value = rental.data()?.itemName;
        return typeof value === "string" && value.trim() !== "" ? [normalizeName(value)] : [];
      }),
    ),
  );
}

/**
 * The server-side half of the in-use restriction. The list also disables the controls, but that
 * is a convenience: a client that skips the UI still has to come through here.
 */
export async function assertNotInUse(category: MasterDataCategory, name: string): Promise<void> {
  const blocked = await namesInUse(category);
  if (blocked.has(normalizeName(name))) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

/**
 * The same answer keyed by document id, which is what the list view needs. Resolving the names
 * here rather than in the browser keeps one definition of "the same name" — the client would
 * otherwise have to re-implement the comparison, and drift the moment either side changed.
 */
export async function blockedItemIds(category: MasterDataCategory): Promise<string[]> {
  const blocked = await namesInUse(category);
  if (blocked.size === 0) return [];

  const items = await adminDb.collection(category.collection).get();
  return items.docs
    .filter((item) => {
      const name = item.data()?.name;
      return typeof name === "string" && blocked.has(normalizeName(name));
    })
    .map((item) => item.id);
}
