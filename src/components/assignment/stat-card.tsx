/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  /** Shown after the title, so the headline figure moves even when no other one does. */
  count: number;
  /** Given only where the card is a choice, as the weeks are and the classes are not (US-12). */
  selection?: { selected: boolean; onSelect: () => void };
  children: ReactNode;
};

/**
 * One block of figures, folded away by the triangle in front of its title — pointing right when
 * the card is closed and down when it is open. Every card folds on its own, so a teacher can
 * keep the one they are working on open and the rest out of the way.
 */
export function StatCard({ title, count, selection, children }: StatCardProps) {
  const [expanded, setExpanded] = useState(true);
  const heading = `${title}: ${count}`;

  return (
    <Card
      size="sm"
      role="group"
      aria-label={title}
      onClick={selection?.onSelect}
      className={cn(
        selection && "hover:bg-muted cursor-pointer transition-colors",
        selection?.selected && "bg-accent hover:bg-accent",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Details zu ${title}`}
            aria-expanded={expanded}
            // Folding a card away says nothing about which of them is being worked on, so it
            // stops here rather than selecting the card it sits in.
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((open) => !open);
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md p-0.5 transition-colors outline-none focus-visible:ring-3"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-4 transition-transform", expanded && "rotate-90")}
            />
          </button>

          {selection ? (
            // A control of its own, so the card can be picked without a pointer. Named after the
            // card rather than after its heading, so a changing figure is not a changing name.
            <button
              type="button"
              aria-label={title}
              aria-pressed={selection.selected}
              onClick={selection.onSelect}
              className="focus-visible:ring-ring/50 rounded-md text-left outline-none focus-visible:ring-3"
            >
              {heading}
            </button>
          ) : (
            heading
          )}
        </CardTitle>
      </CardHeader>

      {expanded && <CardContent className="flex flex-col gap-3">{children}</CardContent>}
    </Card>
  );
}
