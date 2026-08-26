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
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/schemas/season";
import { SEASON_STATE_LABELS, seasonState } from "@/lib/seasons/season-state";

const ARCHIVE_ACTIVE_HINT = "Eine aktive Saison muss zuerst deaktiviert werden.";
const ARCHIVE_NO_DATA_HINT = "Eine Saison ohne Schülerdaten kann nicht archiviert werden.";
const DELETE_HINT =
  "Eine Saison mit Schülerdaten kann nur gelöscht werden, wenn sie archiviert ist.";

type SeasonListProps = {
  seasons: Season[];
  loading: boolean;
  error: string | null;
  onEdit: (season: Season) => void;
  onDelete: (season: Season) => void;
  onActiveChange: (season: Season, isActive: boolean) => void;
  onArchivedChange: (season: Season, isArchived: boolean) => void;
  /** Receives the ids of the shown seasons in their new order (see Ordering). */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  busySeasonId?: string | null;
};

export function SeasonList({
  seasons,
  loading,
  error,
  onEdit,
  onDelete,
  onActiveChange,
  onArchivedChange,
  onReorder,
  busySeasonId = null,
}: SeasonListProps) {
  if (loading) {
    return (
      <Card className="items-center">
        <div role="status" aria-label="Saisonen werden geladen" className="text-muted-foreground">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          Saisonen konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (seasons.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">
          Es gibt noch keine Saison.
        </p>
      </Card>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <SortableList
        items={seasons}
        onReorder={onReorder}
        busyId={busySeasonId}
        className="[&>li]:border-border [&>li]:border-b [&>li:last-child]:border-b-0"
        renderItem={(season) => {
          const state = seasonState(season);
          const archiveHintId = `${season.id}-archive-hint`;
          const deleteHintId = `${season.id}-delete-hint`;
          // Mirrors season-service.ts: archiving needs student data to sign off on, and an
          // active season must be deactivated first; deleting still-unarchived data needs it
          // gone first (US-4).
          const archivingDisabled =
            state === "active" || (!season.isArchived && !season.hasStudentData);
          const archiveHint = state === "active" ? ARCHIVE_ACTIVE_HINT : ARCHIVE_NO_DATA_HINT;
          const deletingDisabled = !season.isArchived && season.hasStudentData;
          const busy = busySeasonId === season.id;

          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pr-4 pl-2">
              <span className="flex-1 text-sm font-medium">{season.name}</span>

              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                  state === "active"
                    ? "bg-accent text-accent-foreground border-transparent"
                    : "text-muted-foreground",
                )}
              >
                {SEASON_STATE_LABELS[state]}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <Tooltip label="Events">
                  <Link
                    href={`/app/master-data/seasons/${season.id}`}
                    aria-label={`Events der Saison ${season.name}`}
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

                {/* An inactive season can be activated and the active one stood down again, so
                    the teacher can leave no season active at all; an archived one is neither
                    (US-4). With no active season, students cannot edit master data (US-11). */}
                {state === "inactive" ? (
                  <Tooltip label="Aktiv setzen">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Saison ${season.name} aktiv setzen`}
                      onClick={() => onActiveChange(season, true)}
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
                      aria-label={`Saison ${season.name} deaktivieren`}
                      onClick={() => onActiveChange(season, false)}
                    >
                      <CircleSlash aria-hidden />
                    </Button>
                  </Tooltip>
                ) : null}

                <Tooltip label="Bearbeiten">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Saison ${season.name} bearbeiten`}
                    onClick={() => onEdit(season)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                </Tooltip>

                <Tooltip label={season.isArchived ? "Wiederherstellen" : "Archivieren"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={archivingDisabled || busy}
                      aria-label={
                        season.isArchived
                          ? `Saison ${season.name} wiederherstellen`
                          : `Saison ${season.name} archivieren`
                      }
                      aria-describedby={archivingDisabled ? archiveHintId : undefined}
                      onClick={() => onArchivedChange(season, !season.isArchived)}
                    >
                      {season.isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
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
                      aria-label={`Saison ${season.name} löschen`}
                      aria-describedby={deletingDisabled ? deleteHintId : undefined}
                      onClick={() => onDelete(season)}
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
