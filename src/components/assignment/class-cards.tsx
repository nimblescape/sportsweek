/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { ClassRow } from "@/lib/assignment/statistics";
import { cn } from "@/lib/utils";
import { SkillMatrix } from "./skill-matrix";

/** Whole per cent: the figure answers "roughly how many of them are coming", not to a decimal. */
const asPercent = (share: number) => `${Math.round(share * 100)} %`;

/**
 * Registrations per class (US-12). Only these cards count the students who answered "no": they
 * are what "angemeldet" and the share are about, and they appear in no other figure, because
 * only a student who is coming can be assigned to an event.
 */
export function ClassCards({
  rows,
  programs,
  skillLevels,
}: {
  rows: readonly ClassRow[];
  programs: readonly string[];
  skillLevels: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <ClassCard key={row.class} row={row} programs={programs} skillLevels={skillLevels} />
      ))}
    </div>
  );
}

function ClassCard({
  row,
  programs,
  skillLevels,
}: {
  row: ClassRow;
  programs: readonly string[];
  skillLevels: readonly string[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card size="sm" role="group" aria-label={row.class}>
      <CardContent className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Details zu ${row.class}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md p-0.5 transition-colors outline-none focus-visible:ring-3"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-4 transition-transform", expanded && "rotate-90")}
            />
          </button>
          {`${row.class}: ${row.total}`}
        </CardTitle>

        {expanded && (
          <>
            <p className="text-muted-foreground text-sm">
              Angemeldet: {row.total} · Nimmt teil: {row.attending} · Anteil:{" "}
              {asPercent(row.attendanceRate)} · Männlich: {row.male} · Weiblich: {row.female}
            </p>

            <SkillMatrix counts={row.skillLevels} programs={programs} skillLevels={skillLevels} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
