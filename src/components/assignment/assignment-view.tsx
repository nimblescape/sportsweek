/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { assignmentGroups } from "@/lib/assignment/statistics";
import { useSeasonRoster } from "@/lib/assignment/use-season-roster";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";
import { BusyRegion } from "@/components/ui/busy-region";
import { AssignmentBoard } from "./assignment-board";

/**
 * The assignment dialog of US-12, scoped to the active season: a board of cards — one per week,
 * plus the students who have no week yet — a teacher drags students between.
 *
 * Every figure is computed from the same live roster the cards are drawn from, so an assignment
 * shows up as soon as the subscription brings the record back.
 */
export function AssignmentView() {
  const { season, loading, error, students, events, columns, programNames, skillLevelNames, filterGroups } = useSeasonRoster(); // prettier-ignore
  const [saving, setSaving] = useState(false);

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading || saving);

  /**
   * The write and the refresh are separate paths, so the whole view is held until the answer
   * comes back: every card counts the same records, and a second drag against figures this one
   * is still changing would be acting on what is no longer true.
   */
  async function assign(recordIds: string[], eventId: string | null) {
    setSaving(true);
    try {
      await apiRequest("/api/assignments", { method: "PATCH", body: { recordIds, eventId } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="font-heading text-lg font-semibold">Zuteilung</h1>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {season === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_ACTIVE_SEASON_HINT}
        </p>
      ) : (
        <BusyRegion busy={saving}>
          <div className="flex flex-col gap-4">
            {events.length === 0 ? (
              <p role="status" className="text-muted-foreground text-sm">
                Für diese Saison gibt es noch keine Events.
              </p>
            ) : (
              <AssignmentBoard
                groups={assignmentGroups(students, events, columns)}
                programs={programNames}
                skillLevels={skillLevelNames}
                columns={columns}
                registered={students}
                filterGroups={filterGroups}
                onMove={assign}
              />
            )}
          </div>
        </BusyRegion>
      )}
    </div>
  );
}
