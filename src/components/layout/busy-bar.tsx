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
 * One indicator for the whole app (US-14, US-15).
 *
 * At the end of the row it is placed in rather than over anything: the header's own row already
 * ends in space nothing else occupies, and an indicator drawn over the event series tags (US-20)
 * cannot be read. One place always answering "the app is working on it" is easier to learn than
 * an indicator that appears somewhere new each time.
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
      className={cn(
        "pointer-events-none flex h-(--control-height) shrink-0 items-center gap-1",
        className,
      )}
    >
      {BARS.map((delay) => (
        <span
          key={delay}
          data-busy-bar
          style={{ animationDelay: `${delay}s` }}
          // Wide enough to be seen from across the header: four hairlines in the corner of the
          // window read as nothing at all, which is the same as having no indicator.
          className="bg-muted-foreground animate-busy-bar block h-4 w-1 rounded-full"
        />
      ))}
    </div>
  );
}
