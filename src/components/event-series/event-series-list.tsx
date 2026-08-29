/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EventSeries } from "@/lib/schemas/event-series";
import {
  ARCHIVE_NO_DATA_HINT,
  ARCHIVE_OPEN_HINT,
  EVENT_SERIES_STATE_LABELS,
  eventSeriesState,
  LAST_EVENT_SERIES_HINT,
} from "@/lib/event-series/event-series-state";

const DELETE_HINT =
  "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.";

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
  // The header spinner says the app is working; a second one on the list would say it twice.
  if (loading) return null;

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          Eventreihen konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (eventSeries.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">
          Es gibt noch keine Eventreihe.
        </p>
      </Card>
    );
  }

  // Counted over the whole list rather than per row, so a row can tell whether it is the last one.
  const unarchived = eventSeries.filter((one) => !one.isArchived).length;

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <SortableList
        items={eventSeries}
        onReorder={onReorder}
        busyId={busyEventSeriesId}
        className="[&>li]:border-border [&>li]:border-b [&>li:last-child]:border-b-0"
        renderItem={(eventSeries) => {
          const state = eventSeriesState(eventSeries);
          const archiveHintId = `${eventSeries.id}-archive-hint`;
          const deleteHintId = `${eventSeries.id}-delete-hint`;
          // Mirrors event-series-service.ts: archiving needs registrations to sign off on and a
          // series nobody can still register in, and deleting unarchived data needs it gone first
          // (US-19). Null means the action is offered.
          const archiveHint = eventSeries.isArchived
            ? null
            : eventSeries.isOpenToStudents
              ? ARCHIVE_OPEN_HINT
              : !eventSeries.hasRegistrations
                ? ARCHIVE_NO_DATA_HINT
                : null;
          const archivingDisabled = archiveHint !== null;
          const deleteHint = !eventSeries.isArchived
            ? eventSeries.hasRegistrations
              ? DELETE_HINT
              : unarchived === 1
                ? LAST_EVENT_SERIES_HINT
                : null
            : null;
          const deletingDisabled = deleteHint !== null;
          const busy = busyEventSeriesId === eventSeries.id;

          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pr-4 pl-2">
              <span className="flex-1 text-sm font-medium">{eventSeries.name}</span>

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

              <div className="flex shrink-0 items-center gap-1">
                {/* An archived eventSeries is finished with: it can be unarchived or removed, but
                    not rewritten, and neither its name nor its place is up for change (US-19). */}
                {eventSeries.isArchived ? null : (
                  <Tooltip label="Bearbeiten">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Eventreihe ${eventSeries.name} bearbeiten`}
                      onClick={() => onEdit(eventSeries)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip
                  label={
                    archiveHint ?? (eventSeries.isArchived ? "Wiederherstellen" : "Archivieren")
                  }
                >
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={archivingDisabled || busy}
                      aria-label={
                        eventSeries.isArchived
                          ? `Eventreihe ${eventSeries.name} wiederherstellen`
                          : `Eventreihe ${eventSeries.name} archivieren`
                      }
                      aria-describedby={archivingDisabled ? archiveHintId : undefined}
                      onClick={() => onArchivedChange(eventSeries, !eventSeries.isArchived)}
                    >
                      {eventSeries.isArchived ? (
                        <ArchiveRestore aria-hidden />
                      ) : (
                        <Archive aria-hidden />
                      )}
                    </Button>
                  </span>
                </Tooltip>

                {archiveHint === null ? null : (
                  <span id={archiveHintId} className="sr-only">
                    {archiveHint}
                  </span>
                )}

                {/* Wrapped in a span because a disabled button emits no pointer events, and the
                    reason it is disabled is exactly what needs explaining here (US-19). */}
                <Tooltip label={deleteHint ?? "Löschen"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deletingDisabled || busy}
                      aria-label={`Eventreihe ${eventSeries.name} löschen`}
                      aria-describedby={deletingDisabled ? deleteHintId : undefined}
                      onClick={() => onDelete(eventSeries)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </Tooltip>

                {deleteHint === null ? null : (
                  <span id={deleteHintId} className="sr-only">
                    {deleteHint}
                  </span>
                )}
              </div>
            </div>
          );
        }}
      />
    </Card>
  );
}
