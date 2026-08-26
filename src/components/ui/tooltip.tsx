/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

type TooltipProps = {
  /**
   * Repeats the trigger's own `aria-label`, so it stays a visual aid only — the popup is
   * hidden from assistive technology to avoid announcing the same words twice.
   */
  label: string;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
};

export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delay={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side={side} sideOffset={6}>
            <TooltipPrimitive.Popup
              aria-hidden
              className={cn(
                "bg-foreground text-background z-50 rounded-md px-2 py-1 text-xs font-medium shadow-md",
                "origin-(--transform-origin) transition-[transform,opacity] data-ending-style:opacity-0 data-starting-style:opacity-0",
                className,
              )}
            >
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
