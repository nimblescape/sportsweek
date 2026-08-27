/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { Transaction, WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { reservationKey } from "./reservation-key";

export { normalizeName, scopeOf } from "./reservation-key";

export function reservationRef(scope: string, name: string) {
  return adminDb.collection(COLLECTIONS.reservedNames).doc(reservationKey(scope, name));
}

type Reservation = { scope: string; name: string; ownerId: string };

/**
 * Claims a name by writing a document whose id *is* the name.
 *
 * Firestore has no unique constraint, but document ids are unique by construction, so this
 * turns "is this name free?" into a single-document read. That matters for more than elegance:
 * the obvious alternative — querying the siblings inside the transaction — makes Firestore lock
 * the index range it scans, so two teachers adding events to *different* seasons block each
 * other. Measured against the emulator that took ~20s; this takes milliseconds, because two
 * different names are two different documents and never contend.
 *
 * Firestore requires every read before the first write, so call this before writing the record.
 */
export async function reserveName(
  transaction: Transaction,
  { scope, name, ownerId }: Reservation,
): Promise<void> {
  const reference = reservationRef(scope, name);
  const existing = await transaction.get(reference);

  if (existing.exists && existing.data()?.ownerId !== ownerId) {
    throw new ServiceError(
      ErrorCode.Conflict,
      scope.includes(":")
        ? `Den Namen „${name.trim()}" gibt es hier bereits.`
        : `Den Namen „${name.trim()}" gibt es bereits.`,
    );
  }

  transaction.set(reference, { scope, name: name.trim(), ownerId });
}

/** Frees a name for reuse — on rename, and when its owner is deleted. */
export function releaseName(
  writer: Transaction | WriteBatch,
  { scope, name }: Omit<Reservation, "ownerId">,
): void {
  writer.delete(reservationRef(scope, name));
}
