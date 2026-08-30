/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { classOverview } from "@/lib/assignment/statistics";
import { useEventSeriesRoster } from "@/lib/assignment/use-event-series-roster";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import { PageHeading } from "@/components/layout/page-heading";
import { MASTER_DATA_CATEGORIES, noneMaintainedHint } from "@/lib/master-data/categories";
import { useInvitations } from "@/lib/invitations/use-invitations";
import { ClassCards } from "./class-cards";

/**
 * A series whose classes have not been maintained yet has nothing to draw a card from, and a
 * page that simply stays empty reads as broken rather than as unfinished (US-21, US-29).
 */
export const NO_CLASSES_HINT = noneMaintainedHint(MASTER_DATA_CATEGORIES.classes);

/**
 * Where an event series is run from (US-29): one card per class of the selected series, the
 * students in it attending and not, and that class's figures. Opening it to students is done on
 * its tag in the header, which names the series it concerns and is on screen from every page.
 */
export function RegistrationsView({ eventSeriesId }: { eventSeriesId: string }) {
  const { eventSeries, missing, error, students, classes, columns, programNames, skillLevelNames, filterGroups } = useEventSeriesRoster(eventSeriesId); // prettier-ignore
  const invitations = useInvitations(eventSeriesId, eventSeries?.isOpenToStudents);

  // An archived series is read-only, so it has nobody left to invite (US-19).
  const openable = eventSeries !== null && !eventSeries.isArchived;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading>Registrierungen</PageHeading>

      {(error ?? invitations.error) !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? invitations.error}
        </p>
      )}

      {eventSeries === null ? (
        missing ? (
          <p role="status" className="text-muted-foreground text-sm">
            {NO_EVENT_SERIES_HINT}
          </p>
        ) : null
      ) : classes.length === 0 ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_CLASSES_HINT}
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
