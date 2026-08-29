/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { useHold } from "@/lib/api/busy";

/**
 * Which row of a list a write is currently running on, and whether one is running at all.
 *
 * Every control on a row acts on the same record — deleting it, activating it, opening what
 * hangs off it — so while one of them is waiting for its round trip the others are offering
 * actions against a record that may already be gone. On a slow connection that window is long
 * enough to act in, and the second action then fails against data the first one removed. The
 * same holds for the list as a whole, which is why `pending` covers writes that belong to no
 * row at all: adding an item, or dropping one into a new position.
 *
 * The row is released as soon as the write is answered: the list refreshes from a Firestore
 * subscription that the very same write feeds, so by then the new data is already on its way.
 */
export function useRowAction() {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(0);
  const hold = useHold();

  /** `id` is null for a write with no row of its own, which holds the list without holding a row. */
  const run = React.useCallback(
    async <T>(id: string | null, action: () => Promise<T>): Promise<T> => {
      const release = hold();
      setBusyId(id);
      setRunning((count) => count + 1);
      try {
        return await action();
      } finally {
        release();
        setBusyId(null);
        setRunning((count) => count - 1);
      }
    },
    [hold],
  );

  return { busyId, pending: running > 0, run };
}
