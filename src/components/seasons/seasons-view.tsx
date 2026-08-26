/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusyRegion } from "@/components/ui/busy-region";
import { DeleteSeasonDialog } from "@/components/seasons/delete-season-dialog";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";
import { SeasonList } from "@/components/seasons/season-list";
import { apiRequest, ApiRequestError, type RequestOptions } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
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
  const { busyId, pending, run } = useRowAction();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toggleId = React.useId();

  useBusyWhile(loading);

  const listed = visibleSeasons(seasons, showArchived);

  // The list is a live Firestore subscription, so a successful write shows up on its own.
  const closeDialog = () => setDialog({ kind: "none" });

  // The whole row is held while the round trip runs, so a slow connection cannot leave the
  // other controls offering actions against a season this one is already changing.
  async function writeSeason(season: Season, request: RequestOptions) {
    setActionError(null);
    try {
      await run(season.id, () => apiRequest(`/api/seasons/${season.id}`, request));
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  }

  // Typing the name out only earns its keep when there is student data to lose (US-4).
  function handleDelete(season: Season) {
    if (season.hasStudentData) {
      setDialog({ kind: "delete", season });
    } else {
      void writeSeason(season, { method: "DELETE" });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <BusyRegion busy={pending}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-lg font-semibold">Saisonen</h1>
            <Button onClick={() => setDialog({ kind: "form", season: null })}>
              <Plus aria-hidden data-icon="inline-start" />
              Neue Saison
            </Button>
          </div>

          <label
            htmlFor={toggleId}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
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
            busySeasonId={busyId}
            onEdit={(season) => setDialog({ kind: "form", season })}
            onDelete={handleDelete}
            onActiveChange={(season, isActive) =>
              writeSeason(season, { method: "PATCH", body: { isActive } })
            }
            onArchivedChange={(season, isArchived) =>
              writeSeason(season, { method: "PATCH", body: { isArchived } })
            }
            onReorder={(orderedIds) =>
              run(null, () => {
                // The list may be hiding archived seasons, so the visible order is folded back
                // into the full one rather than sent on its own (see Ordering).
                const order = applyVisibleOrder(
                  seasons.map((season) => season.id),
                  orderedIds,
                );
                return apiRequest("/api/seasons", { method: "PATCH", body: { order } });
              }).then(() => {})
            }
          />
        </div>
      </BusyRegion>

      {dialog.kind === "form" ? (
        <SeasonFormDialog
          key={dialog.season?.id ?? "new"}
          open
          season={dialog.season}
          onSubmit={(name, season) =>
            run(season?.id ?? null, () =>
              season === null
                ? apiRequest("/api/seasons", { method: "POST", body: { name } })
                : apiRequest(`/api/seasons/${season.id}`, { method: "PATCH", body: { name } }),
            ).then(() => {})
          }
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
