/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { IN_USE_HINT, type MasterDataCategory } from "./categories";

/**
 * The registrations of one event series. Now that a list belongs to a series rather than to the
 * whole application (US-21), what an edit can reach is exactly this — which is why the question
 * is asked of one series instead of every non-archived one.
 */
async function registrationsOf(eventSeriesId: string) {
  const found = await adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventSeriesId", "==", eventSeriesId)
    .get();

  return found.docs;
}

function normalizedNames(values: unknown[]): string[] {
  return values.flatMap((value) =>
    typeof value === "string" && value.trim() !== "" ? [normalizeName(value)] : [],
  );
}

/**
 * The names an editing teacher may not touch, normalized for comparison.
 *
 * The lists store names, and so do the registrations that select from them — a registration
 * keeps the plain text rather than a reference (US-11), which is exactly why this is a name
 * match and not a join.
 */
export async function namesInUse(
  eventSeriesId: string,
  category: MasterDataCategory,
): Promise<Set<string>> {
  const registrations = await registrationsOf(eventSeriesId);
  const field = category.usage.field;

  return new Set(normalizedNames(registrations.map((record) => record.data()?.[field])));
}

/**
 * Required equipment is chosen per student, so it is the rental selections that mark an entry as
 * used — never the program that requires it (US-5). They are a field of the registration, so the
 * records already read above are the whole answer.
 */
export async function equipmentNamesInUse(eventSeriesId: string): Promise<Set<string>> {
  const registrations = await registrationsOf(eventSeriesId);

  return new Set(
    registrations.flatMap((record) => {
      const rented = record.data()?.rentedEquipment;
      return Array.isArray(rented) ? normalizedNames(rented) : [];
    }),
  );
}

/**
 * The server-side half of the in-use restriction. The list also disables the controls, but that
 * is a convenience: a client that skips the UI still has to come through here.
 */
export async function assertNotInUse(
  eventSeriesId: string,
  category: MasterDataCategory,
  name: string,
): Promise<void> {
  const blocked = await namesInUse(eventSeriesId, category);
  if (blocked.has(normalizeName(name))) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

/** Rejects as soon as one of `names` is still rented by a student of this event series (US-5). */
export async function assertEquipmentNotInUse(
  eventSeriesId: string,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;

  const blocked = await equipmentNamesInUse(eventSeriesId);
  if (names.some((name) => blocked.has(normalizeName(name)))) {
    throw new ServiceError(ErrorCode.Conflict, IN_USE_HINT);
  }
}

export type MasterDataUsageReport = {
  /** In use itself, so it can be neither edited nor deleted. Names, since a name is the identity. */
  blockedNames: string[];
  /**
   * Per program name, the entries of its own equipment list a student still rents, spelled
   * exactly as the program stores them. A program with entries here cannot be deleted, since
   * deleting it would take them along — but it can still be renamed (US-5).
   */
  blockedEquipment: Record<string, string[]>;
};

/**
 * The same answer keyed by name, which is what the list view needs. Resolving it here rather
 * than in the browser keeps one definition of "the same name" — the client would otherwise have
 * to re-implement the comparison, and drift the moment either side changed.
 */
export async function usageReport(
  eventSeriesId: string,
  category: MasterDataCategory,
  items: readonly { name: string; requiredEquipment?: readonly string[] }[],
): Promise<MasterDataUsageReport> {
  const blocked = await namesInUse(eventSeriesId, category);
  const blockedNames = items
    .filter((item) => blocked.has(normalizeName(item.name)))
    .map((item) => item.name);

  if (category.equipmentField === undefined) {
    return { blockedNames, blockedEquipment: {} };
  }

  const blockedEquipmentNames = await equipmentNamesInUse(eventSeriesId);
  const blockedEquipment: Record<string, string[]> = {};

  for (const item of items) {
    const rented = (item.requiredEquipment ?? []).filter((entry) =>
      blockedEquipmentNames.has(normalizeName(entry)),
    );
    if (rented.length > 0) blockedEquipment[item.name] = rented;
  }

  return { blockedNames, blockedEquipment };
}
