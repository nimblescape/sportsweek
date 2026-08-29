/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useBusy } from "@/lib/api/busy";
import { cn } from "@/lib/utils";

/** Out of phase, or the bars rise and fall as one block and read as a single bar. */
const BARS = [0, 0.15, 0.3, 0.45];

/**
 * One indicator for the whole app, on the line between the header and the content (US-14, US-15).
 *
 * Not in the header's middle: that is where the event series tags are (US-20), and an indicator
 * drawn over them cannot be read. It straddles the border instead — centred across the width,
 * centred on the line itself — which is space nothing else occupies, and one place always
 * answering "the app is working on it" is easier to learn than an indicator that appears
 * somewhere new each time.
 *
 * Bars rather than a bar that travels: most writes are answered before a sweep has crossed even
 * once, so it looked like nothing was happening. These cycle several times a second, which is
 * what makes a wait too short to measure still visible.
 */
export function BusyBar({ className }: { className?: string } = {}) {
  const busy = useBusy();

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-label="Wird gespeichert"
      // Centred on the border rather than above it: half its height sits either side of the line.
      className={cn(
        "pointer-events-none absolute inset-x-0 -bottom-1.5 z-20 flex justify-center",
        className,
      )}
    >
      <div className="bg-background flex h-3 items-center gap-0.5 px-1.5">
        {BARS.map((delay) => (
          <span
            key={delay}
            data-busy-bar
            style={{ animationDelay: `${delay}s` }}
            // Short on purpose, so it stays on the line instead of reaching up into the tags.
            // Darker than the line it sits on: in the line's own grey it went unnoticed.
            className="bg-muted-foreground animate-busy-bar block h-2 w-0.5 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
