/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { assignmentGroups } from "@/lib/assignment/statistics";
import { useEventSeriesRoster } from "@/lib/assignment/use-event-series-roster";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import { BusyRegion } from "@/components/ui/busy-region";
import { PageHeading } from "@/components/layout/page-heading";
import { MASTER_DATA_CATEGORIES, noneMaintainedHint } from "@/lib/master-data/categories";
import { AssignmentBoard } from "./assignment-board";

/**
 * The assignment dialog of US-12, scoped to the selected event series: a board of cards — one per
 * week, plus the students who have no week yet — a teacher drags students between.
 *
 * Every figure is computed from the same live roster the cards are drawn from, so an assignment
 * shows up as soon as the subscription brings the record back.
 */
export function AssignmentView({ eventSeriesId }: { eventSeriesId: string }) {
  const { eventSeries, missing, error, students, events, columns, programNames, skillLevelNames, filterGroups } = useEventSeriesRoster(eventSeriesId); // prettier-ignore
  const [saving, setSaving] = useState(false);

  // Answered by the one spinner in the header, so this view places none of its own. The read is
  // not reported: a teacher moving between the pages of a series has started nothing to wait for.
  useBusyWhile(saving);

  /**
   * The write and the refresh are separate paths, so the whole view is held until the answer
   * comes back: every card counts the same records, and a second drag against figures this one
   * is still changing would be acting on what is no longer true.
   */
  async function assign(recordIds: string[], event: string | null) {
    setSaving(true);
    try {
      await apiRequest(`/api/event-series/${eventSeriesId}/assignments`, {
        method: "PATCH",
        body: { recordIds, event },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading>Zuteilungen</PageHeading>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {eventSeries === null ? (
        missing ? (
          <p role="status" className="text-muted-foreground text-sm">
            {NO_EVENT_SERIES_HINT}
          </p>
        ) : null
      ) : (
        <BusyRegion busy={saving}>
          <div className="flex flex-col gap-4">
            {events.length === 0 ? (
              <p role="status" className="text-muted-foreground text-sm">
                {noneMaintainedHint(MASTER_DATA_CATEGORIES.events)}
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
