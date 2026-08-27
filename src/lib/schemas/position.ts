/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";

/**
 * Where an item sits in the order its teacher chose (see Ordering). Alphabetical would be a
 * guess at intent — skill levels are ranked, pickup points follow the bus route.
 *
 * A record written before ordering existed has no position at all, and sorts last rather than
 * first: a missing value must not silently jump an item to the top of someone's list.
 */
export const positionSchema = z.number().int().nonnegative().default(Number.MAX_SAFE_INTEGER);

const collator = new Intl.Collator("de-AT");

type Positioned = { name: string; position: number };

/** Ties break by name so the order stays stable rather than following document id. */
export function byPosition(a: Positioned, b: Positioned): number {
  return a.position - b.position || collator.compare(a.name, b.name);
}

/**
 * Folds an order made on a filtered list back into the full one.
 *
 * The event series list can hide archived event series, so a teacher may reorder only part of it. Sending
 * just the visible ids would push everything hidden to the end; instead the reordered items are
 * dealt back into the slots the visible items already occupied, leaving the hidden ones where
 * they were.
 */
export function applyVisibleOrder(
  allIds: readonly string[],
  visibleOrderedIds: readonly string[],
): string[] {
  const visible = new Set(visibleOrderedIds);
  let next = 0;

  return allIds.map((id) => (visible.has(id) ? visibleOrderedIds[next++] : id));
}
