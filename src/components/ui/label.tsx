/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023 shadcn
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 *
 * Adapted from shadcn/ui (https://ui.shadcn.com), MIT licensed.
 * See LICENSE and THIRD-PARTY-NOTICES.md in the repository root for details.
 */
"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
