/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import type { EventRow } from "@/lib/assignment/statistics";
import { SkillMatrix } from "./skill-matrix";
import { StatCard } from "./stat-card";

type EventCardsProps = {
  rows: readonly EventRow[];
  /** Both in the order the teacher put them in, which is what the matrix is laid out by. */
  programs: readonly string[];
  skillLevels: readonly string[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
};

/**
 * One card per event of the season, holding the same attending-only figures the class cards
 * carry: only a student who is coming can be assigned, so there is no total and no share to
 * show here (US-12).
 *
 * The card is also how the teacher picks the week the lists below work on.
 */
export function EventCards({ rows, programs, skillLevels, selectedId, onSelect }: EventCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <StatCard
          key={row.id}
          title={row.name}
          count={row.assigned}
          selection={{ selected: row.id === selectedId, onSelect: () => onSelect(row.id) }}
        >
          <p className="text-muted-foreground text-sm">
            Männlich: {row.male} · Weiblich: {row.female}
          </p>

          <SkillMatrix counts={row.skillLevels} programs={programs} skillLevels={skillLevels} />
        </StatCard>
      ))}
    </div>
  );
}
