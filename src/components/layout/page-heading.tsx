/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";

/**
 * A page's title, and whatever controls belong beside it.
 *
 * The row is floored at the height of a button so that a page carrying controls and a page
 * carrying none put their heading in the same place: without it, walking from the report to the
 * assignment moved the title up the moment the export buttons were no longer there.
 */
export function PageHeading({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-lg font-semibold">{children}</h1>
      {actions}
    </div>
  );
}
