/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { useDndContext } from "@dnd-kit/core";

/**
 * Marks the document while a drag is under way.
 *
 * A cursor comes from whatever the pointer is over, and during a drag the pointer has almost
 * always left the item it picked up — so a closed hand set on that item stops applying the moment
 * the drag becomes worth showing. The mark lets one rule in `globals.css` hold the cursor closed
 * wherever the drag travels. Rendered inside a `DndContext`, which is what knows a drag is on.
 */
export function DraggingCursor() {
  const { active } = useDndContext();
  const dragging = active !== null;

  React.useEffect(() => {
    if (!dragging) return;

    document.body.dataset.dragging = "";
    return () => {
      delete document.body.dataset.dragging;
    };
  }, [dragging]);

  return null;
}
