/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo, useState } from "react";
import { assignmentGroups, classOverview, skillColumns } from "@/lib/assignment/statistics";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useEvents } from "@/lib/events/use-events";
import { filterGroups } from "@/lib/filters/student-filter";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { activeSeasonOf, NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";
import { useRoster } from "@/lib/students/use-roster";
import { BusyRegion } from "@/components/ui/busy-region";
import { AssignmentBoard } from "./assignment-board";
import { ClassCards } from "./class-cards";

/** Off while the board is being worked on; the cards themselves are ready for when it is done. */
const SHOW_CLASS_CARDS = false;

/**
 * The assignment dialog of US-12, scoped to the active season: how the classes stand, and a
 * board of cards — one per week, plus the students who have no week yet — a teacher drags
 * students between.
 *
 * Every figure is computed from the same live roster the cards are drawn from, so an assignment
 * shows up as soon as the subscription brings the record back.
 */
export function AssignmentView() {
  const { seasons, loading: seasonsLoading, error: seasonsError } = useSeasons();
  const [saving, setSaving] = useState(false);

  // Two active seasons is a data defect a teacher cannot act on here, so it is reported rather
  // than thrown — a throw would take the page down with it.
  const active = useMemo(() => {
    try {
      return { season: activeSeasonOf(seasons), error: null };
    } catch (caught) {
      return { season: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [seasons]);

  const seasonId = active.season?.id ?? null;
  // No season means no id to scope by, and a query for the empty one matches nothing — which is
  // what this view shows anyway.
  const { events, loading: eventsLoading } = useEvents(seasonId ?? "");
  const { students, loading: rosterLoading, error: rosterError } = useRoster(seasonId);
  const classes = useMasterData("classes");
  const skillLevels = useMasterData("skill-levels");
  const { programs } = usePrograms();

  const loading = seasonsLoading || eventsLoading || rosterLoading || classes.loading;

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading || saving);

  const columns = useMemo(
    () => skillColumns(programs, skillLevels.items),
    [programs, skillLevels.items],
  );
  const programNames = useMemo(() => programs.map((program) => program.name), [programs]);
  const skillLevelNames = useMemo(
    () => skillLevels.items.map((item) => item.name),
    [skillLevels.items],
  );
  const groups = useMemo(
    () => filterGroups({ classes: classes.items, programs, skillLevels: skillLevels.items }),
    [classes.items, programs, skillLevels.items],
  );

  const error = seasonsError ?? active.error ?? rosterError;

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

      {active.season === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_ACTIVE_SEASON_HINT}
        </p>
      ) : (
        <BusyRegion busy={saving}>
          <div className="flex flex-col gap-4">
            {SHOW_CLASS_CARDS && (
              <ClassCards
                rows={classOverview(students, classes.items, columns)}
                programs={programNames}
                skillLevels={skillLevelNames}
              />
            )}

            {events.length === 0 ? (
              <p role="status" className="text-muted-foreground text-sm">
                Für diese Saison gibt es noch keine Events.
              </p>
            ) : (
              <AssignmentBoard
                groups={assignmentGroups(students, events, columns)}
                programs={programNames}
                skillLevels={skillLevelNames}
                filterGroups={groups}
                onMove={assign}
              />
            )}
          </div>
        </BusyRegion>
      )}
    </div>
  );
}
