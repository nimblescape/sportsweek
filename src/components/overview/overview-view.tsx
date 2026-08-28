/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { classOverview } from "@/lib/assignment/statistics";
import { useEventSeriesRoster } from "@/lib/assignment/use-event-series-roster";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import {
  EVENT_SERIES_STATE_LABELS,
  NO_EVENT_SERIES_HINT,
} from "@/lib/event-series/event-series-state";
import { PageHeading } from "@/components/layout/page-heading";
import { Tag } from "@/components/ui/tag";
import { useInvitations } from "@/lib/invitations/use-invitations";
import { ClassCards } from "./class-cards";

/**
 * Where an event series is run from (US-29): one card per class of the selected series, the
 * students in it attending and not, and that class's figures. It is where a series is opened to
 * students and where its classes are invited, which is why it is a page rather than a header on
 * the board — setting a series up and assigning a week are done at different times.
 */
export function OverviewView({ eventSeriesId }: { eventSeriesId: string }) {
  const { eventSeries, loading, error, students, classes, columns, programNames, skillLevelNames, filterGroups } = useEventSeriesRoster(eventSeriesId); // prettier-ignore
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const invitations = useInvitations(eventSeriesId);

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading || saving);

  // Neither can ever be open, so neither is offered the control: a page that offers to open what
  // cannot be opened is a page explaining a refusal it did not have to make (US-19, US-22).
  const openable = eventSeries !== null && !eventSeries.isTemplate && !eventSeries.isArchived;

  async function setOpenToStudents(isOpenToStudents: boolean) {
    setActionError(null);
    setSaving(true);
    try {
      await apiRequest(`/api/event-series/${eventSeriesId}`, {
        method: "PATCH",
        body: { isOpenToStudents },
      });
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading
        actions={
          openable ? (
            <Tag
              label={
                eventSeries.isOpenToStudents
                  ? EVENT_SERIES_STATE_LABELS.open
                  : EVENT_SERIES_STATE_LABELS.closed
              }
              size="sm"
              pressed={eventSeries.isOpenToStudents}
              onPress={() => setOpenToStudents(!eventSeries.isOpenToStudents)}
            />
          ) : undefined
        }
      >
        Übersicht
      </PageHeading>

      {(error ?? actionError ?? invitations.error) !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? actionError ?? invitations.error}
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
        />
      )}
    </div>
  );
}
