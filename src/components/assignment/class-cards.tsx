/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import type { ClassRow } from "@/lib/assignment/statistics";
import { SkillMatrix } from "./skill-matrix";
import { StatCard } from "./stat-card";

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
        <StatCard key={row.class} title={row.class} count={row.total}>
          <p className="text-muted-foreground text-sm">
            Angemeldet: {row.total} · Nimmt teil: {row.attending} · Anteil:{" "}
            {asPercent(row.attendanceRate)} · Männlich: {row.male} · Weiblich: {row.female}
          </p>

          <SkillMatrix counts={row.skillLevels} programs={programs} skillLevels={skillLevels} />
        </StatCard>
      ))}
    </div>
  );
}
