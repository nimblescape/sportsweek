/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { RecordList, type RecordRow } from "@/components/master-data/record-list";
import { cn } from "@/lib/utils";
import type { EventSeries } from "@/lib/schemas/event-series";
import { eventSeriesRecordPath } from "@/lib/master-data/hierarchy";
import {
  ARCHIVE_NO_DATA_HINT,
  ARCHIVE_OPEN_HINT,
  EVENT_SERIES_STATE_LABELS,
  eventSeriesState,
  LAST_EVENT_SERIES_HINT,
} from "@/lib/event-series/event-series-state";

const DELETE_HINT =
  "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.";

const SINGULAR = "Eventreihe";

type EventSeriesListProps = {
  eventSeries: EventSeries[];
  loading: boolean;
  error: string | null;
  onEdit: (eventSeries: EventSeries) => void;
  onDelete: (eventSeries: EventSeries) => void;
  onArchivedChange: (eventSeries: EventSeries, isArchived: boolean) => void;
  /** Receives the ids of the shown event series in their new order (see Ordering). */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  busyEventSeriesId?: string | null;
};

/**
 * The root of the master data hierarchy, on the one list every level uses (US-33). An event
 * series is that list plus two things of its own, both composed into the row: the state it is in,
 * and archiving — which is what keeps it the same screen rather than a second one (US-19).
 */
export function EventSeriesList({
  eventSeries,
  loading,
  error,
  onEdit,
  onDelete,
  onArchivedChange,
  onReorder,
  busyEventSeriesId = null,
}: EventSeriesListProps) {
  // Counted over the whole list rather than per row, so a row can tell whether it is the last one.
  const unarchived = eventSeries.filter((one) => !one.isArchived).length;
  const found = (id: string) => eventSeries.find((one) => one.id === id);

  const rows: RecordRow[] = eventSeries.map((one) => ({
    id: one.id,
    name: one.name,
    href: eventSeriesRecordPath(one.id),
    badge: <StateBadge eventSeries={one} />,
    actions: (
      <ArchiveAction
        eventSeries={one}
        hint={archiveHintFor(one)}
        busy={busyEventSeriesId === one.id}
        onArchivedChange={onArchivedChange}
      />
    ),
    // An archived series is finished with: it can be restored or removed, but neither its name
    // nor its place is up for change (US-19).
    edit: !one.isArchived,
    remove: deleteHintFor(one, unarchived) ?? true,
  }));

  return (
    <RecordList
      singular={SINGULAR}
      title="Eventreihen"
      empty="Es gibt noch keine Eventreihe."
      rows={rows}
      loading={loading}
      error={error}
      busyId={busyEventSeriesId}
      onEdit={(row) => {
        const one = found(row.id);
        if (one) onEdit(one);
      }}
      onDelete={(row) => {
        const one = found(row.id);
        if (one) onDelete(one);
      }}
      onReorder={onReorder}
    />
  );
}

/**
 * Mirrors event-series-service.ts: archiving needs registrations to sign off on and a series
 * nobody can still register in. Null means it is offered.
 */
function archiveHintFor(eventSeries: EventSeries): string | null {
  if (eventSeries.isArchived) return null;
  if (eventSeries.isOpenToStudents) return ARCHIVE_OPEN_HINT;
  return eventSeries.hasRegistrations ? null : ARCHIVE_NO_DATA_HINT;
}

/** Deleting unarchived data needs it archived first, and a school keeps one series to work in. */
function deleteHintFor(eventSeries: EventSeries, unarchived: number): string | null {
  if (eventSeries.isArchived) return null;
  if (eventSeries.hasRegistrations) return DELETE_HINT;
  return unarchived === 1 ? LAST_EVENT_SERIES_HINT : null;
}

function StateBadge({ eventSeries }: { eventSeries: EventSeries }) {
  const state = eventSeriesState(eventSeries);

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-xs",
        state === "open"
          ? "bg-accent text-accent-foreground border-transparent"
          : "text-muted-foreground",
      )}
    >
      {EVENT_SERIES_STATE_LABELS[state]}
    </span>
  );
}

function ArchiveAction({
  eventSeries,
  hint,
  busy,
  onArchivedChange,
}: {
  eventSeries: EventSeries;
  /** Why archiving is refused, or null where it is offered. */
  hint: string | null;
  busy: boolean;
  onArchivedChange: (eventSeries: EventSeries, isArchived: boolean) => void;
}) {
  const hintId = `${eventSeries.id}-archive-hint`;

  return (
    <>
      {/* Wrapped in a span because a disabled button emits no pointer events, and the reason it
          is disabled is exactly what needs explaining here (US-19). */}
      <Tooltip label={hint ?? (eventSeries.isArchived ? "Wiederherstellen" : "Archivieren")}>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon"
            disabled={hint !== null || busy}
            aria-label={`${SINGULAR} ${eventSeries.name} ${
              eventSeries.isArchived ? "wiederherstellen" : "archivieren"
            }`}
            aria-describedby={hint === null ? undefined : hintId}
            onClick={() => onArchivedChange(eventSeries, !eventSeries.isArchived)}
          >
            {eventSeries.isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </Button>
        </span>
      </Tooltip>

      {hint === null ? null : (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </>
  );
}
