/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type BusyOverlayProps = {
  busy: boolean;
  /** What is being waited for, announced while the spinner is up. */
  label: string;
  children: React.ReactNode;
};

/**
 * Holds a whole section still while a write is in flight (see useRowAction).
 *
 * `inert` is what makes this a guard rather than a hint: everything underneath stops answering
 * pointer, keyboard and screen reader alike, so a second action cannot be started against data
 * the first one is still changing. The list refreshes from a subscription the write feeds, so
 * the window between the answer and the new data is exactly what this covers.
 */
export function BusyOverlay({ busy, label, children }: BusyOverlayProps) {
  return (
    <div className="relative">
      <div inert={busy} className={cn("transition-opacity", busy && "opacity-50")}>
        {children}
      </div>
      {busy ? (
        <div role="status" aria-label={label} className="absolute inset-0 grid place-items-center">
          <LoaderCircle aria-hidden className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
