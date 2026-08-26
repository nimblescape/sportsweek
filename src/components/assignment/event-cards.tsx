/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { skillColumnKey, type EventRow } from "@/lib/assignment/statistics";
import { cn } from "@/lib/utils";

type EventCardsProps = {
  rows: readonly EventRow[];
  /** Both in the order the teacher put them in, which is what the matrix is laid out by. */
  programs: readonly string[];
  skillLevels: readonly string[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
};

/**
 * One card per event of the season, holding the same attending-only figures the class table
 * carries: only a student who is coming can be assigned, so there is no total and no share to
 * show here (US-12).
 *
 * The card is also how the teacher picks the event the transfer lists below work on.
 */
export function EventCards({ rows, programs, skillLevels, selectedId, onSelect }: EventCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <EventCard
          key={row.id}
          row={row}
          programs={programs}
          skillLevels={skillLevels}
          selected={row.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function EventCard({
  row,
  programs,
  skillLevels,
  selected,
  onSelect,
}: {
  row: EventRow;
  programs: readonly string[];
  skillLevels: readonly string[];
  selected: boolean;
  onSelect: (eventId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card
      size="sm"
      role="group"
      aria-label={row.name}
      onClick={() => onSelect(row.id)}
      className={cn(
        "hover:bg-muted cursor-pointer transition-colors",
        selected && "bg-accent hover:bg-accent",
      )}
    >
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2">
          <input
            type="radio"
            name="assignment-event"
            className="accent-primary size-4"
            aria-label={row.name}
            checked={selected}
            onChange={() => onSelect(row.id)}
          />
          {row.name}
        </CardTitle>

        <button
          type="button"
          aria-label={`Details zu ${row.name}`}
          aria-expanded={expanded}
          // Folding a card away says nothing about which week is being assigned, so it stops
          // here rather than selecting the card it sits in.
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 w-fit rounded-md p-1 transition-colors outline-none focus-visible:ring-3"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 transition-transform", expanded && "rotate-90")}
          />
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Männlich: {row.male} · Weiblich: {row.female}
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-max text-sm">
              <thead>
                <tr>
                  <th />
                  {programs.map((program) => (
                    <th
                      key={program}
                      scope="col"
                      className="text-muted-foreground border-border border-b px-3 py-1.5 text-right font-medium"
                    >
                      {program}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skillLevels.map((skillLevel) => (
                  <tr key={skillLevel}>
                    <th
                      scope="row"
                      className="text-muted-foreground border-border border-b py-1.5 pr-3 text-left font-medium"
                    >
                      {skillLevel}
                    </th>
                    {programs.map((program) => (
                      <td
                        key={program}
                        className="border-border border-b px-3 py-1.5 text-right tabular-nums"
                      >
                        {row.skillLevels[skillColumnKey(program, skillLevel)] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
