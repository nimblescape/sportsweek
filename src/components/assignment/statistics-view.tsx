/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { classOverview } from "@/lib/assignment/statistics";
import { useEventSeriesRoster } from "@/lib/assignment/use-event-series-roster";
import { useBusyWhile } from "@/lib/api/busy";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import { PageHeading } from "@/components/layout/page-heading";
import { ClassCards } from "./class-cards";

/**
 * How the classes of the selected event series stand (US-12): one card per maintained class,
 * counting the students who answered "no" alongside the ones who are coming. It is a page of its
 * own rather than a header on the board, because reading a class and assigning a week are two
 * things a teacher does at different times.
 */
export function StatisticsView({ eventSeriesId }: { eventSeriesId: string }) {
  const { eventSeries, loading, error, students, classes, columns, programNames, skillLevelNames, filterGroups } = useEventSeriesRoster(eventSeriesId); // prettier-ignore

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading>Statistik</PageHeading>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {eventSeries === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_EVENT_SERIES_HINT}
        </p>
      ) : (
        <ClassCards
          rows={classOverview(students, classes, columns)}
          programs={programNames}
          skillLevels={skillLevelNames}
          columns={columns}
          filterGroups={filterGroups}
        />
      )}
    </div>
  );
}
