/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MasterDataView } from "@/components/master-data/master-data-view";
import { cn } from "@/lib/utils";

/**
 * The programs list, plus the way into each program's own required equipment (US-5). The nested
 * list stays reachable even while the program itself is locked: its items are matched through
 * the students' rental selections, so the two are blocked independently.
 */
export function ProgramsView() {
  return (
    <MasterDataView
      category="programs"
      renderRowAction={(program) => (
        <Tooltip label="Benötigte Ausrüstung">
          <Link
            href={`/app/master-data/programs/${program.id}`}
            aria-label={`Benötigte Ausrüstung für ${program.name}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <Package aria-hidden className="size-3.5" />
          </Link>
        </Tooltip>
      )}
    />
  );
}
