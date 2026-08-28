/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { skillColumns, type SkillColumn } from "@/lib/assignment/statistics";
import { filterGroups, type FilterGroup } from "@/lib/filters/student-filter";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { useSelectedEventSeries } from "@/lib/event-series/use-selected-event-series";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { RosterStudent } from "@/lib/students/roster";
import { useRoster } from "@/lib/students/use-roster";

export type EventSeriesRoster = {
  /** Null once loaded means the id names nothing selectable — the views lock instead of guessing. */
  eventSeries: EventSeries | null;
  loading: boolean;
  error: string | null;
  /** Everyone registered for the selected event series, taking part or not. */
  students: RosterStudent[];
  /** The events of that series, by name, in the teacher's order (US-12, US-21). */
  events: string[];
  classes: string[];
  columns: SkillColumn[];
  programNames: string[];
  skillLevelNames: string[];
  filterGroups: FilterGroup[];
};

/** Which of the report-only tag categories to offer; the board has a use for none of them. */
type EventSeriesRosterOptions = {
  attendance?: boolean;
  completeness?: boolean;
  equipmentRental?: boolean;
  health?: boolean;
  /** Bus pickup point, season pass and food together — three categories nothing else offers. */
  answerLists?: boolean;
  events?: boolean;
};

/**
 * The selected event series and everything the views built on it count: the roster, its events, the
 * maintained lists behind the tables, and the tags to filter by. Held here because the
 * assignment board, the overview and the report all need exactly this, and copies of it would
 * drift the moment one gained a list the others did not.
 *
 * Which series that is comes from the page (US-20, Q8) rather than being resolved here, so the
 * header decides once and every view agrees.
 *
 * The options add the tag categories only the report has a use for (US-13).
 */
export function useEventSeriesRoster(
  eventSeriesId: string,
  options: EventSeriesRosterOptions = {},
): EventSeriesRoster {
  const {
    attendance = false,
    completeness = false,
    equipmentRental = false,
    health = false,
    answerLists = false,
    events: eventTags = false,
  } = options;
  const {
    eventSeries: selected,
    loading: eventSeriesLoading,
    error: eventSeriesError,
  } = useSelectedEventSeries(eventSeriesId);

  const { students, loading: rosterLoading, error: rosterError } = useRoster(selected?.id ?? null);
  // The events are a field of the series, so they arrive with it rather than on their own (US-21).
  // Memoised because the fallback would otherwise be a new array on every render.
  const events = useMemo(() => selected?.events ?? [], [selected]);
  const classes = useMasterData("classes", eventSeriesId);
  const skillLevels = useMasterData("skill-levels", eventSeriesId);
  const busPickupPoints = useMasterData("bus-pickup-points", eventSeriesId);
  const seasonPassOptions = useMasterData("season-pass-options", eventSeriesId);
  const foodOptions = useMasterData("food-options", eventSeriesId);
  const { programs } = usePrograms(eventSeriesId);

  const columns = useMemo(
    () => skillColumns(programs, skillLevels.items),
    [programs, skillLevels.items],
  );
  const programNames = useMemo(() => programs.map((program) => program.name), [programs]);
  const skillLevelNames = skillLevels.items;
  const groups = useMemo(
    () =>
      filterGroups(
        {
          classes: classes.items,
          programs,
          skillLevels: skillLevels.items,
          busPickupPoints: busPickupPoints.items,
          seasonPassOptions: seasonPassOptions.items,
          foodOptions: foodOptions.items,
        },
        {
          attendance,
          completeness,
          equipmentRental,
          health,
          busPickupPoint: answerLists,
          seasonPassOption: answerLists,
          foodOption: answerLists,
          ...(eventTags ? { events } : {}),
        },
      ),
    [
      attendance,
      completeness,
      equipmentRental,
      health,
      answerLists,
      eventTags,
      events,
      classes.items,
      programs,
      skillLevels.items,
      busPickupPoints.items,
      seasonPassOptions.items,
      foodOptions.items,
    ],
  );

  return {
    eventSeries: selected,
    loading: eventSeriesLoading || rosterLoading || classes.loading,
    error: eventSeriesError ?? rosterError,
    students,
    events,
    classes: classes.items,
    columns,
    programNames,
    skillLevelNames,
    filterGroups: groups,
  };
}
