/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/master-data/hierarchy";

export const BREADCRUMB_LABEL = "Pfad";

/**
 * The full address of the page, one step per record and collection above it (US-33). It ends at
 * the record on screen, which the title beneath repeats: a trail that stopped a step short would
 * be empty at the root, and the title would jump a row as a teacher walked down the hierarchy.
 */
export function Breadcrumb({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label={BREADCRUMB_LABEL}>
      <ol className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {trail.map((crumb, index) => (
          <li key={`${crumb.href}|${crumb.label}`} className="flex min-w-0 items-center gap-1">
            {index === 0 ? null : <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
            {index === trail.length - 1 ? (
              <span aria-current="page" className="text-foreground truncate">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground truncate transition-colors">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
