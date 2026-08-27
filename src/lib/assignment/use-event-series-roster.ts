/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { skillColumns, type SkillColumn } from "@/lib/assignment/statistics";
import { useEvents } from "@/lib/events/use-events";
import { filterGroups, type FilterGroup } from "@/lib/filters/student-filter";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import type { NamedListItem } from "@/lib/schemas/master-data";
import type { Event, EventSeries } from "@/lib/schemas/event-series";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import type { RosterStudent } from "@/lib/students/roster";
import { useRoster } from "@/lib/students/use-roster";

export type EventSeriesRoster = {
  /** Null is a state a teacher creates by deactivating, not a fault — the views lock instead. */
  eventSeries: EventSeries | null;
  loading: boolean;
  error: string | null;
  /** Everyone registered for the active event series, taking part or not. */
  students: RosterStudent[];
  events: Event[];
  classes: NamedListItem[];
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
  events?: boolean;
};

/**
 * The active event series and everything the views built on it count: the roster, its events, the
 * maintained lists behind the tables, and the tags to filter by. Held here because the
 * assignment board, the statistics and the report all need exactly this, and copies of it would
 * drift the moment one gained a list the others did not.
 *
 * The options add the tag categories only the report has a use for (US-13).
 */
export function useEventSeriesRoster(options: EventSeriesRosterOptions = {}): EventSeriesRoster {
  const {
    attendance = false,
    completeness = false,
    equipmentRental = false,
    health = false,
    events: eventTags = false,
  } = options;
  const { eventSeries, loading: eventSeriesLoading, error: eventSeriesError } = useEventSeries();

  // Two active event series is a data defect a teacher cannot act on here, so it is reported rather
  // than thrown — a throw would take the page down with it.
  const active = useMemo(() => {
    try {
      return { eventSeries: activeEventSeriesOf(eventSeries), error: null };
    } catch (caught) {
      return {
        eventSeries: null,
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
  }, [eventSeries]);

  const { students, loading: rosterLoading, error: rosterError } = useRoster(active.eventSeries?.id ?? null); // prettier-ignore
  // No event series means no id to scope by, and a query for the empty one matches nothing.
  const { events, loading: eventsLoading } = useEvents(active.eventSeries?.id ?? "");
  const classes = useMasterData("classes");
  const skillLevels = useMasterData("skill-levels");
  const { programs } = usePrograms();

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
    () =>
      filterGroups(
        { classes: classes.items, programs, skillLevels: skillLevels.items },
        { attendance, completeness, equipmentRental, health, ...(eventTags ? { events } : {}) },
      ),
    [
      attendance,
      completeness,
      equipmentRental,
      health,
      eventTags,
      events,
      classes.items,
      programs,
      skillLevels.items,
    ],
  );

  return {
    eventSeries: active.eventSeries,
    loading: eventSeriesLoading || rosterLoading || eventsLoading || classes.loading,
    error: eventSeriesError ?? active.error ?? rosterError,
    students,
    events,
    classes: classes.items,
    columns,
    programNames,
    skillLevelNames,
    filterGroups: groups,
  };
}
