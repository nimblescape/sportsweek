/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { LoaderCircle } from "lucide-react";
import { useBusy } from "@/lib/api/busy";

/**
 * One spinner for the whole app, centred in the header (US-14, US-15).
 *
 * It sits in the middle of the screen rather than on the list that is waiting, because a write
 * takes the list out of reach anyway (see BusyRegion) and the same place always answering "the
 * app is working on it" is easier to learn than a spinner that appears somewhere new each time.
 * Absolutely positioned so it is centred on the header itself, not on what is left between the
 * title and the sign-out button.
 */
export function HeaderSpinner() {
  const busy = useBusy();

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-label="Wird gespeichert"
      className="pointer-events-none absolute inset-x-0 flex justify-center"
    >
      <LoaderCircle aria-hidden className="text-muted-foreground size-5 animate-spin" />
    </div>
  );
}
