/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";

type Reorder = {
  collection: string;
  /** The ids in the order the teacher dropped them into. */
  orderedIds: readonly string[];
  /** Restricts renumbering to one parent's items, e.g. the events of a single season. */
  scope?: { field: string; value: string };
};

/**
 * Rewrites an ordered list as consecutive positions from zero (see Ordering).
 *
 * Positions are renumbered wholesale rather than patched, so the stored order can never drift
 * into ties or gaps however the list is edited. Ordering touches no name, so it is deliberately
 * not subject to the in-use restriction that governs editing and removing.
 *
 * Ids the caller did not mention are kept and appended in their previous order: a teacher who
 * adds an item while another is dragging must not have it disappear from the list.
 */
export async function reorderCollection({ collection, orderedIds, scope }: Reorder): Promise<void> {
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new ServiceError(ErrorCode.ValidationError, "Ein Eintrag wurde doppelt übergeben.");
  }

  const query =
    scope === undefined
      ? adminDb.collection(collection)
      : adminDb.collection(collection).where(scope.field, "==", scope.value);
  const snapshot = await query.get();

  const known = new Map(snapshot.docs.map((document) => [document.id, document]));

  const missing = orderedIds.find((id) => !known.has(id));
  if (missing !== undefined) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es hier nicht.");
  }

  const rest = snapshot.docs
    .filter((document) => !orderedIds.includes(document.id))
    .sort((a, b) => Number(a.data()?.position ?? 0) - Number(b.data()?.position ?? 0))
    .map((document) => document.id);

  const operations: BatchOperation[] = [...orderedIds, ...rest].map(
    (id, position) => (batch) => batch.update(known.get(id)!.ref, { position }),
  );

  await commitInChunks(operations);
}
