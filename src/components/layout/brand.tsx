/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import Image from "next/image";

/**
 * The school's mark and the application's name. It heads the navigation bar for a teacher and
 * the header itself for a student, who has no bar — so it is written once and placed twice.
 *
 * Laid out as a navigation row is: the logo occupies the same square the icons do and is centred
 * in it, so the name starts where every label below it starts.
 *
 * Anything passed in sits beside the name and on its baseline. Two text spans in one row is what
 * makes that exact — aligning against the logo's box instead would only ever be close.
 */
export function Brand({ children }: { children?: ReactNode }) {
  return (
    // A control's height, so the name lines up with the tags across the header: both sit one
    // step in from the top of the window, and a taller row here would drop it below them.
    <span className="flex h-(--control-height) shrink-0 items-center gap-3 px-2">
      <span className="flex w-6 shrink-0 items-center justify-center">
        <Image
          src="/htl-logo.svg"
          alt="HTL Dornbirn Logo"
          width={24}
          height={28}
          priority
          className="h-auto w-6"
        />
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-heading text-xl font-semibold tracking-tight">Sportsweek</span>
        {children}
      </span>
    </span>
  );
}
