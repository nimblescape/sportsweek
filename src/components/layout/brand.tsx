/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The school's mark and the application's name. It heads the navigation bar for a teacher and
 * the header itself for a student, who has no bar — so it is written once and placed twice.
 *
 * Laid out as a navigation row is: the logo occupies the same square the icons do and is centred
 * in it, so the name starts where every label below it starts. The name goes away with the bar
 * it sits in, a collapsed rail being the width of that square.
 */
export function Brand({ nameHidden = false }: { nameHidden?: boolean }) {
  return (
    <span className="flex min-h-9 shrink-0 items-center gap-3 px-2 py-2">
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
      <span
        className={cn(
          "font-heading text-xl font-semibold tracking-tight",
          nameHidden && "md:sr-only",
        )}
      >
        Sportsweek
      </span>
    </span>
  );
}
