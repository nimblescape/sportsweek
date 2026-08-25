"use client";

import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CircleCheck,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/schemas/season";
import { SEASON_STATE_LABELS, seasonState } from "@/lib/seasons/season-state";

const DELETE_HINT = "Nur archivierte Saisonen können gelöscht werden.";

type SeasonListProps = {
  seasons: Season[];
  loading: boolean;
  error: string | null;
  onEdit: (season: Season) => void;
  onDelete: (season: Season) => void;
  onActivate: (season: Season) => void;
  onArchivedChange: (season: Season, isArchived: boolean) => void;
  busySeasonId?: string | null;
};

export function SeasonList({
  seasons,
  loading,
  error,
  onEdit,
  onDelete,
  onActivate,
  onArchivedChange,
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
      <ul>
        {seasons.map((season) => {
          const state = seasonState(season);
          const hintId = `${season.id}-delete-hint`;
          const busy = busySeasonId === season.id;

          return (
            <li
              key={season.id}
              className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0"
            >
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
                <Link
                  href={`/app/master-data/seasons/${season.id}`}
                  aria-label={`Events der Saison ${season.name}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                >
                  <CalendarDays aria-hidden className="size-3.5" />
                </Link>

                {/* Only an inactive season can be activated: the active one already is, and an
                    archived one is not allowed to be (US-4). */}
                {state === "inactive" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Saison ${season.name} aktiv setzen`}
                    onClick={() => onActivate(season)}
                  >
                    <CircleCheck aria-hidden />
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={`Saison ${season.name} bearbeiten`}
                  onClick={() => onEdit(season)}
                >
                  <Pencil aria-hidden />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={
                    season.isArchived
                      ? `Saison ${season.name} wiederherstellen`
                      : `Saison ${season.name} archivieren`
                  }
                  onClick={() => onArchivedChange(season, !season.isArchived)}
                >
                  {season.isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!season.isArchived || busy}
                  aria-label={`Saison ${season.name} löschen`}
                  aria-describedby={season.isArchived ? undefined : hintId}
                  onClick={() => onDelete(season)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 aria-hidden />
                </Button>

                {season.isArchived ? null : (
                  <span id={hintId} className="sr-only">
                    {DELETE_HINT}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
