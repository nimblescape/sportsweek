/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EventSeries } from "@/lib/schemas/event-series";
import { EVENT_SERIES_STATE_LABELS, eventSeriesState } from "@/lib/event-series/event-series-state";

const ARCHIVE_ACTIVE_HINT =
  "Eine aktive Eventreihe muss zuerst deaktiviert werden, damit sie archiviert werden kann.";
const ARCHIVE_NO_DATA_HINT = "Eine Eventreihe ohne Anmeldungen kann nicht archiviert werden.";
const DELETE_HINT =
  "Eine Eventreihe mit Anmeldungen kann nur gelöscht werden, wenn sie archiviert ist.";

type EventSeriesListProps = {
  eventSeries: EventSeries[];
  loading: boolean;
  error: string | null;
  onEdit: (eventSeries: EventSeries) => void;
  onDelete: (eventSeries: EventSeries) => void;
  onActiveChange: (eventSeries: EventSeries, isActive: boolean) => void;
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
  onActiveChange,
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
          // Mirrors event-series-service.ts: archiving needs registrations to sign off on, and an
          // active event series must be deactivated first; deleting still-unarchived data needs it
          // gone first (US-4).
          const archivingDisabled =
            state === "active" || (!eventSeries.isArchived && !eventSeries.hasRegistrations);
          const archiveHint = state === "active" ? ARCHIVE_ACTIVE_HINT : ARCHIVE_NO_DATA_HINT;
          const deletingDisabled = !eventSeries.isArchived && eventSeries.hasRegistrations;
          const busy = busyEventSeriesId === eventSeries.id;

          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pr-4 pl-2">
              <span className="flex-1 text-sm font-medium">{eventSeries.name}</span>

              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                  state === "active"
                    ? "bg-accent text-accent-foreground border-transparent"
                    : "text-muted-foreground",
                )}
              >
                {EVENT_SERIES_STATE_LABELS[state]}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <Tooltip label="Events">
                  <Link
                    href={`/app/master-data/event-series/${eventSeries.id}`}
                    aria-label={`Events der Eventreihe ${eventSeries.name}`}
                    // A link has no disabled state of its own, so being busy has to be spelled
                    // out for the pointer, the keyboard and assistive technology separately.
                    aria-disabled={busy || undefined}
                    tabIndex={busy ? -1 : undefined}
                    onClick={busy ? (clicked) => clicked.preventDefault() : undefined}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    <CalendarDays aria-hidden className="size-3.5" />
                  </Link>
                </Tooltip>

                {/* An inactive eventSeries can be activated and the active one stood down again, so
                    the teacher can leave no eventSeries active at all; an archived one is neither
                    (US-4). With no active eventSeries, students cannot edit their registration (US-11). */}
                {state === "inactive" ? (
                  <Tooltip label="Aktiv setzen">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Eventreihe ${eventSeries.name} aktiv setzen`}
                      onClick={() => onActiveChange(eventSeries, true)}
                    >
                      <CircleCheck aria-hidden />
                    </Button>
                  </Tooltip>
                ) : null}

                {state === "active" ? (
                  <Tooltip label="Deaktivieren">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Eventreihe ${eventSeries.name} deaktivieren`}
                      onClick={() => onActiveChange(eventSeries, false)}
                    >
                      <CircleSlash aria-hidden />
                    </Button>
                  </Tooltip>
                ) : null}

                {/* An archived eventSeries is finished with: it can be unarchived or removed, but
                    not rewritten, and neither its name nor its place is up for change (US-4). */}
                {eventSeries.isArchived ? null : (
                  <Tooltip label="Bearbeiten">
                    <Button
                      variant="ghost"
                      size="icon-sm"
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
                    archivingDisabled
                      ? archiveHint
                      : eventSeries.isArchived
                        ? "Wiederherstellen"
                        : "Archivieren"
                  }
                >
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
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

                {archivingDisabled ? (
                  <span id={archiveHintId} className="sr-only">
                    {archiveHint}
                  </span>
                ) : null}

                {/* Wrapped in a span because a disabled button emits no pointer events, and the
                    reason it is disabled is exactly what needs explaining here (US-4). */}
                <Tooltip label={deletingDisabled ? DELETE_HINT : "Löschen"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
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

                {deletingDisabled ? (
                  <span id={deleteHintId} className="sr-only">
                    {DELETE_HINT}
                  </span>
                ) : null}
              </div>
            </div>
          );
        }}
      />
    </Card>
  );
}
