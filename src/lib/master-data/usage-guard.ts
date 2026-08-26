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

function normalizedNames(values: unknown[]): string[] {
  return values.flatMap((value) =>
    typeof value === "string" && value.trim() !== "" ? [normalizeName(value)] : [],
  );
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
  const field = category.usage.field;

  return new Set(normalizedNames(records.map((record) => record.data()?.[field])));
}

/**
 * Required equipment is chosen per student, so it is the rental selections that mark an entry as
 * used — never the program that requires it (US-5). They are a field of the master data record,
 * so the records already read above are the whole answer.
 */
export async function equipmentNamesInUse(): Promise<Set<string>> {
  const records = await openRecords();

  return new Set(
    records.flatMap((record) => {
      const rented = record.data()?.rentedEquipment;
      return Array.isArray(rented) ? normalizedNames(rented) : [];
    }),
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

/** Rejects as soon as one of `names` is still rented by a student of an open season (US-5). */
export async function assertEquipmentNotInUse(names: readonly string[]): Promise<void> {
  if (names.length === 0) return;

  const blocked = await equipmentNamesInUse();
  if (names.some((name) => blocked.has(normalizeName(name)))) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

export type MasterDataUsageReport = {
  /** In use itself, so it can be neither edited nor deleted. */
  blockedIds: string[];
  /**
   * Per item id, the entries of its own equipment list a student of an open season still rents,
   * spelled exactly as the item stores them. An item with entries here cannot be deleted, since
   * deleting it would take them along — but it can still be renamed (US-5).
   */
  blockedEquipment: Record<string, string[]>;
};

/**
 * The same answer keyed by document id, which is what the list view needs. Resolving the names
 * here rather than in the browser keeps one definition of "the same name" — the client would
 * otherwise have to re-implement the comparison, and drift the moment either side changed.
 */
export async function usageReport(category: MasterDataCategory): Promise<MasterDataUsageReport> {
  const blocked = await namesInUse(category);
  const equipmentField = category.equipmentField;
  const needsItems = blocked.size > 0 || equipmentField !== undefined;

  const items = needsItems ? (await adminDb.collection(category.collection).get()).docs : [];
  const blockedIds = items
    .filter((item) => {
      const name = item.data()?.name;
      return typeof name === "string" && blocked.has(normalizeName(name));
    })
    .map((item) => item.id);

  if (equipmentField === undefined) {
    return { blockedIds, blockedEquipment: {} };
  }

  const blockedEquipmentNames = await equipmentNamesInUse();
  const blockedEquipment: Record<string, string[]> = {};

  for (const item of items) {
    const equipment = item.data()?.[equipmentField];
    if (!Array.isArray(equipment)) continue;

    const rented = equipment.filter(
      (entry) => typeof entry === "string" && blockedEquipmentNames.has(normalizeName(entry)),
    );
    if (rented.length > 0) blockedEquipment[item.id] = rented;
  }

  return { blockedIds, blockedEquipment };
}
