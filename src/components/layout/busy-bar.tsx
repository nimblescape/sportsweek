/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useBusy } from "@/lib/api/busy";

/** Out of phase, or the bars rise and fall as one block and read as a single bar. */
const BARS = [0, 0.15, 0.3, 0.45];

/**
 * One indicator for the whole app, centred on the screen (US-14, US-15).
 *
 * Not in the header: its middle is where the event series tags are (US-20), and an indicator
 * drawn on top of them cannot be read. Centred on the screen instead, over whatever is there —
 * a write takes what it is writing out of reach anyway (see BusyRegion), and one place always
 * answering "the app is working on it" is easier to learn than an indicator that appears
 * somewhere new each time.
 *
 * Bars rather than a bar that travels: most writes are answered before a sweep has crossed even
 * once, so it looked like nothing was happening. These cycle several times a second, which is
 * what makes a wait too short to measure still visible.
 */
export function BusyBar() {
  const busy = useBusy();

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-label="Wird gespeichert"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="bg-background/80 flex items-end gap-1 rounded-lg p-3 shadow-sm">
        {BARS.map((delay) => (
          <span
            key={delay}
            data-busy-bar
            style={{ animationDelay: `${delay}s` }}
            className="bg-primary animate-busy-bar h-6 w-1.5 origin-bottom rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
