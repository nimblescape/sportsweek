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
import type { NamedListItem } from "@/lib/schemas/master-data";
import type { Season } from "@/lib/schemas/season";
import { activeSeasonOf } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";
import type { RosterStudent } from "@/lib/students/roster";
import { useRoster } from "@/lib/students/use-roster";

export type SeasonRoster = {
  /** Null is a state a teacher creates by deactivating, not a fault — the views lock instead. */
  season: Season | null;
  loading: boolean;
  error: string | null;
  /** Everyone registered for the active season, taking part or not. */
  students: RosterStudent[];
  classes: NamedListItem[];
  columns: SkillColumn[];
  programNames: string[];
  skillLevelNames: string[];
  filterGroups: FilterGroup[];
};

/**
 * The active season and everything the views built on it count: the roster, the maintained lists
 * behind the tables, and the tags to filter by. Held here because the assignment board and the
 * statistics both need exactly this, and two copies of it would drift the moment one gained a
 * list the other did not.
 */
export function useSeasonRoster(): SeasonRoster {
  const { seasons, loading: seasonsLoading, error: seasonsError } = useSeasons();

  // Two active seasons is a data defect a teacher cannot act on here, so it is reported rather
  // than thrown — a throw would take the page down with it.
  const active = useMemo(() => {
    try {
      return { season: activeSeasonOf(seasons), error: null };
    } catch (caught) {
      return { season: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [seasons]);

  const { students, loading: rosterLoading, error: rosterError } = useRoster(active.season?.id ?? null); // prettier-ignore
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
    () => filterGroups({ classes: classes.items, programs, skillLevels: skillLevels.items }),
    [classes.items, programs, skillLevels.items],
  );

  return {
    season: active.season,
    loading: seasonsLoading || rosterLoading || classes.loading,
    error: seasonsError ?? active.error ?? rosterError,
    students,
    classes: classes.items,
    columns,
    programNames,
    skillLevelNames,
    filterGroups: groups,
  };
}
