/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";

/**
 * The order the user just dropped, held until the stored data reflects it.
 *
 * Without this a reordered list would flick back: the write goes through a Route Handler rather
 * than the client SDK, so there is no local echo to compensate with, and the subscription only
 * catches up a round trip later. In between, dropping would visibly undo itself.
 *
 * Asked by every list that can be dragged, so a vertical list and a wrapping tag row cannot come
 * to disagree about when a drop stops being the truth.
 */
export function useDroppedOrder<T extends { id: string }>(
  items: readonly T[],
  onReorder: (orderedIds: string[]) => void | Promise<void>,
) {
  const [dropped, setDropped] = React.useState<string[] | null>(null);

  // The local order speaks only for the items it was made from. Once the stored order agrees
  // about those — whatever else was added, removed or renamed alongside — it has nothing left
  // to say, and holding on to it would keep ordering the list by a list that no longer exists.
  // Adjusted during render rather than in an effect, which would show the list twice to say it
  // once.
  if (dropped !== null) {
    const storedIds = items.map((item) => item.id);
    const stillStored = dropped.filter((id) => storedIds.includes(id));
    const asStored = storedIds.filter((id) => dropped.includes(id));
    if (stillStored.join("\u0000") === asStored.join("\u0000")) setDropped(null);
  }

  const ordered = React.useMemo(() => {
    if (dropped === null) return [...items];

    const remaining = new Map(items.map((item) => [item.id, item]));
    const moved = dropped.flatMap((id) => {
      const item = remaining.get(id);
      if (!item) return [];
      remaining.delete(id);
      return [item];
    });

    // Anything added since the drop is kept, so a concurrent create cannot vanish from view.
    return [...moved, ...remaining.values()];
  }, [items, dropped]);

  const drop = React.useCallback(
    async (orderedIds: string[]) => {
      setDropped(orderedIds);
      try {
        await onReorder(orderedIds);
      } catch {
        setDropped(null);
      }
    },
    [onReorder],
  );

  return { ordered, drop };
}
