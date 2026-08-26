/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type BusyRegionProps = {
  busy: boolean;
  children: React.ReactNode;
};

/**
 * Holds a section still while a write is in flight (see useRowAction). The spinner that says so
 * lives in the header, where one of them speaks for the whole app; this only takes the section
 * out of reach.
 *
 * `inert` is what makes that a guard rather than a hint: everything underneath stops answering
 * pointer, keyboard and screen reader alike, so a second action cannot be started against data
 * the first one is still changing. The list refreshes from a subscription the write feeds, so
 * the window between the answer and the new data is exactly what this covers.
 */
export function BusyRegion({ busy, children }: BusyRegionProps) {
  return (
    <div inert={busy} className={cn("transition-opacity", busy && "opacity-50")}>
      {children}
    </div>
  );
}
