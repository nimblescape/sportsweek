/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/master-data/hierarchy";

export const BREADCRUMB_LABEL = "Pfad";

/**
 * The full address of the page, one step per record and collection above it, ending at the page
 * itself (US-33) — which is also its heading, so the name is said once rather than in a title
 * that repeats the trail above it. A page with no ancestors is a trail of one step.
 *
 * Floored at the height of a button, so a page carrying controls beside the heading and a page
 * carrying none put it in the same place.
 */
export function Breadcrumb({ trail, actions }: { trail: readonly Crumb[]; actions?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
      {/* A row rather than a list: the landmark and the heading carry the meaning, and list
          semantics here would put an item into every page that queries for one. */}
      <nav
        aria-label={BREADCRUMB_LABEL}
        className="font-heading flex min-w-0 flex-wrap items-center gap-1.5 text-lg font-semibold"
      >
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.href}|${crumb.label}`}>
            {index === 0 ? null : (
              <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
            )}
            {index === trail.length - 1 ? (
              <h1 aria-current="page" className="truncate">
                {crumb.label}
              </h1>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground truncate font-normal transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        ))}
      </nav>
      {actions}
    </div>
  );
}
