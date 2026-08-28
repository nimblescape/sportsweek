/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useBusy } from "@/lib/api/busy";

/**
 * One indicator for the whole app, on the line between the header and the content (US-14, US-15).
 *
 * On the line rather than in the header, because the header's middle is where the event series
 * tags are (US-20) and a spinner centred there was drawn on top of them. The border is space
 * nothing else occupies, so the indicator can never collide with what it is reporting about —
 * and one place always answering "the app is working on it" is easier to learn than an indicator
 * that appears somewhere new each time.
 *
 * A sweep rather than a filling bar: nothing here knows how far along a write is, and a bar that
 * grows would be claiming to.
 */
export function BusyBar() {
  const busy = useBusy();

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-label="Wird gespeichert"
      // Sits on the header's own bottom edge, over the border it replaces while it runs.
      className="pointer-events-none absolute inset-x-0 -bottom-px h-px overflow-hidden"
    >
      <div className="bg-primary animate-busy-sweep h-full w-1/3" />
    </div>
  );
}
