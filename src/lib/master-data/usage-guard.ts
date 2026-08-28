/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { Query, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { IN_USE_HINT, type MasterDataCategory } from "./categories";

/**
 * A registration of this event series holding this exact value, if there is one.
 *
 * The equality is exact where names elsewhere compare normalized, and that is deliberate: a
 * student picks from the list, so what they store is the list's own spelling, and a list holds
 * one spelling because its uniqueness rule already folds case and surrounding space. A second
 * spelling could only arrive through a rename — which is what this guard refuses.
 */
function holdersOf(eventSeriesId: string, field: string, name: string): Query {
  return adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventSeriesId", "==", eventSeriesId)
    .where(field, "==", name)
    .limit(1);
}

/**
 * Required equipment is chosen per student, so it is the rental selections that mark an entry as
 * used — never the program that requires it (US-5).
 */
function rentersOf(eventSeriesId: string, name: string): Query {
  return adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventSeriesId", "==", eventSeriesId)
    .where("rentedEquipment", "array-contains", name)
    .limit(1);
}

/**
 * The server-side half of the in-use restriction (US-5 to US-10). The list also disables the
 * controls, but that is a convenience: a client that skips the UI still comes through here.
 *
 * It takes the transaction that is about to write the list, and that is the whole point. Asked
 * beforehand, the answer is stale by the time the write lands: a student choosing this very
 * value in between would be left holding something the series no longer offers, and nothing
 * repairs that. Inside the transaction, Firestore locks the range this query scans, so such a
 * save conflicts and one of the two retries and sees the other. Every read has to precede the
 * first write, so this runs before the list is written.
 */
export async function assertNotInUse(
  transaction: Transaction,
  eventSeriesId: string,
  category: MasterDataCategory,
  name: string,
): Promise<void> {
  const holders = await transaction.get(holdersOf(eventSeriesId, category.usage.field, name));
  if (!holders.empty) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

/** Rejects as soon as one of `names` is still rented by a student of this event series (US-5). */
export async function assertEquipmentNotInUse(
  transaction: Transaction,
  eventSeriesId: string,
  names: readonly string[],
): Promise<void> {
  const renters = await Promise.all(
    names.map((name) => transaction.get(rentersOf(eventSeriesId, name))),
  );

  if (renters.some((found) => !found.empty)) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

export type MasterDataUsageReport = {
  /** In use itself, so it can be neither renamed nor deleted. Names, since a name is an identity. */
  blockedNames: string[];
  /**
   * Per program name, the entries of its own equipment list a student still rents, spelled
   * exactly as the program stores them. A program with entries here cannot be deleted, since
   * deleting it would take them along — but it can still be renamed (US-5).
   */
  blockedEquipment: Record<string, string[]>;
};

function normalizedNames(values: unknown[]): string[] {
  return values.flatMap((value) =>
    typeof value === "string" && value.trim() !== "" ? [normalizeName(value)] : [],
  );
}

/**
 * What the list view greys out. One read of the series' registrations rather than the guard's
 * narrow queries, because this answers for every item at once — a query per item would be a
 * hundred round trips to disable some buttons. It is advisory either way: the guard above is
 * what decides, inside the write that matters.
 */
export async function usageReport(
  eventSeriesId: string,
  category: MasterDataCategory,
  items: readonly { name: string; requiredEquipment?: readonly string[] }[],
): Promise<MasterDataUsageReport> {
  const registrations = (
    await adminDb
      .collection(COLLECTIONS.registrations)
      .where("eventSeriesId", "==", eventSeriesId)
      .get()
  ).docs;

  const held = new Set(
    normalizedNames(registrations.map((record) => record.data()?.[category.usage.field])),
  );
  const blockedNames = items
    .filter((item) => held.has(normalizeName(item.name)))
    .map((item) => item.name);

  if (category.equipmentField === undefined) {
    return { blockedNames, blockedEquipment: {} };
  }

  const rented = new Set(
    registrations.flatMap((record) => {
      const entries = record.data()?.rentedEquipment;
      return Array.isArray(entries) ? normalizedNames(entries) : [];
    }),
  );

  const blockedEquipment: Record<string, string[]> = {};
  for (const item of items) {
    const stillRented = (item.requiredEquipment ?? []).filter((entry) =>
      rented.has(normalizeName(entry)),
    );
    if (stillRented.length > 0) blockedEquipment[item.name] = stillRented;
  }

  return { blockedNames, blockedEquipment };
}
