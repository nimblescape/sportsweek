/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteSeasonDialog } from "@/components/seasons/delete-season-dialog";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";
import { SeasonList } from "@/components/seasons/season-list";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import { applyVisibleOrder } from "@/lib/schemas/position";
import type { Season } from "@/lib/schemas/season";
import { visibleSeasons } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";

type OpenDialog =
  { kind: "none" } | { kind: "form"; season: Season | null } | { kind: "delete"; season: Season };

export function SeasonsView() {
  const { seasons, loading, error } = useSeasons();
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  const [busySeasonId, setBusySeasonId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toggleId = React.useId();

  const listed = visibleSeasons(seasons, showArchived);

  // The list is a live Firestore subscription, so a successful write shows up on its own.
  const closeDialog = () => setDialog({ kind: "none" });

  async function patchSeason(season: Season, body: Record<string, unknown>) {
    setBusySeasonId(season.id);
    setActionError(null);
    try {
      await apiRequest(`/api/seasons/${season.id}`, { method: "PATCH", body });
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setBusySeasonId(null);
    }
  }

  async function deleteSeasonDirectly(season: Season) {
    setBusySeasonId(season.id);
    setActionError(null);
    try {
      await apiRequest(`/api/seasons/${season.id}`, { method: "DELETE" });
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setBusySeasonId(null);
    }
  }

  // Typing the name out only earns its keep when there is student data to lose (US-4).
  function handleDelete(season: Season) {
    if (season.hasStudentData) {
      setDialog({ kind: "delete", season });
    } else {
      void deleteSeasonDirectly(season);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">Saisonen</h1>
        <Button onClick={() => setDialog({ kind: "form", season: null })}>
          <Plus aria-hidden data-icon="inline-start" />
          Neue Saison
        </Button>
      </div>

      <label htmlFor={toggleId} className="text-muted-foreground flex items-center gap-2 text-sm">
        <input
          id={toggleId}
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
          className="accent-primary size-4"
        />
        Archivierte Saisonen anzeigen
      </label>

      {actionError ? (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      ) : null}

      <SeasonList
        seasons={listed}
        loading={loading}
        error={error}
        busySeasonId={busySeasonId}
        onEdit={(season) => setDialog({ kind: "form", season })}
        onDelete={handleDelete}
        onActiveChange={(season, isActive) => patchSeason(season, { isActive })}
        onArchivedChange={(season, isArchived) => patchSeason(season, { isArchived })}
        onReorder={(orderedIds) => {
          // The list may be hiding archived seasons, so the visible order is folded back into
          // the full one rather than sent on its own (see Ordering).
          const order = applyVisibleOrder(
            seasons.map((season) => season.id),
            orderedIds,
          );
          return apiRequest("/api/seasons", { method: "PATCH", body: { order } }).then(() => {});
        }}
      />

      {dialog.kind === "form" ? (
        <SeasonFormDialog
          key={dialog.season?.id ?? "new"}
          open
          season={dialog.season}
          onClose={closeDialog}
          onSaved={closeDialog}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteSeasonDialog
          key={dialog.season.id}
          open
          season={dialog.season}
          onClose={closeDialog}
          onDeleted={closeDialog}
        />
      ) : null}
    </div>
  );
}
