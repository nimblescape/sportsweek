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
import { useInvitations } from "@/lib/invitations/use-invitations";
import { ClassCards } from "./class-cards";

/**
 * Where an event series is run from (US-29): one card per class of the selected series, the
 * students in it attending and not, and that class's figures. Opening it to students is done on
 * its tag in the header, which names the series it concerns and is on screen from every page.
 */
export function OverviewView({ eventSeriesId }: { eventSeriesId: string }) {
  const { eventSeries, loading, error, students, classes, columns, programNames, skillLevelNames, filterGroups } = useEventSeriesRoster(eventSeriesId); // prettier-ignore
  const invitations = useInvitations(eventSeriesId);

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading);

  // Neither can ever be open, so neither has anyone to invite (US-19, US-22).
  const openable = eventSeries !== null && !eventSeries.isTemplate && !eventSeries.isArchived;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading>Übersicht</PageHeading>

      {(error ?? invitations.error) !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? invitations.error}
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
          invitations={openable ? invitations : null}
          removableEventSeriesId={openable ? eventSeriesId : null}
          eventSeriesName={eventSeries.name}
        />
      )}
    </div>
  );
}
