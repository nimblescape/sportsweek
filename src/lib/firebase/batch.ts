/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "./admin";

/** Firestore commits at most 500 operations per write batch. */
export const MAX_WRITES_PER_BATCH = 500;

type WriteBatch = ReturnType<typeof adminDb.batch>;
export type BatchOperation = (batch: WriteBatch) => void;

/**
 * Commits operations in batches that stay under the Firestore limit, so a cascade over a
 * collection of unknown size can never fail because of the number of documents involved.
 */
export async function commitInChunks(
  operations: BatchOperation[],
  chunkSize = MAX_WRITES_PER_BATCH,
): Promise<void> {
  for (let start = 0; start < operations.length; start += chunkSize) {
    const batch = adminDb.batch();
    for (const operation of operations.slice(start, start + chunkSize)) operation(batch);
    await batch.commit();
  }
}
