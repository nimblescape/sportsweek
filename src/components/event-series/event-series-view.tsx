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
import { DeleteEventSeriesDialog } from "@/components/event-series/delete-event-series-dialog";
import { EventSeriesFormDialog } from "@/components/event-series/event-series-form-dialog";
import { EventSeriesList } from "@/components/event-series/event-series-list";
import { apiRequest, ApiRequestError, type RequestOptions } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
import { applyVisibleOrder } from "@/lib/schemas/position";
import type { EventSeries } from "@/lib/schemas/event-series";
import { visibleEventSeries } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import { useShowArchived } from "@/lib/event-series/show-archived";
import { Tag } from "@/components/ui/tag";
import { PageHeading } from "@/components/layout/page-heading";

type OpenDialog =
  | { kind: "none" }
  | { kind: "form"; eventSeries: EventSeries | null }
  | { kind: "delete"; eventSeries: EventSeries };

export function EventSeriesView() {
  const { eventSeries, loading, error } = useEventSeries();
  const { showArchived, setShowArchived } = useShowArchived();
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  const { busyId, pending, run } = useRowAction();
  const [actionError, setActionError] = React.useState<string | null>(null);

  useBusyWhile(loading);

  const listed = visibleEventSeries(eventSeries, showArchived);

  // The list is a live Firestore subscription, so a successful write shows up on its own.
  const closeDialog = () => setDialog({ kind: "none" });

  // The whole row is held while the round trip runs, so a slow connection cannot leave the
  // other controls offering actions against an event series this one is already changing.
  async function writeEventSeries(eventSeries: EventSeries, request: RequestOptions) {
    setActionError(null);
    try {
      await run(eventSeries.id, () => apiRequest(`/api/event-series/${eventSeries.id}`, request));
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  }

  // Typing the name out only earns its keep when there are registrations to lose (US-4).
  function handleDelete(eventSeries: EventSeries) {
    if (eventSeries.hasRegistrations) {
      setDialog({ kind: "delete", eventSeries });
    } else {
      void writeEventSeries(eventSeries, { method: "DELETE" });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <BusyRegion busy={pending}>
        <div className="flex flex-col gap-4">
          <PageHeading
            actions={
              <Button onClick={() => setDialog({ kind: "form", eventSeries: null })}>
                <Plus aria-hidden data-icon="inline-start" />
                Neue Eventreihe
              </Button>
            }
          >
            Eventreihen
          </PageHeading>

          <div>
            <Tag
              label="Archivierte Eventreihen anzeigen"
              pressed={showArchived}
              onPress={() => setShowArchived(!showArchived)}
            />
          </div>

          {actionError ? (
            <p role="alert" className="text-destructive text-sm">
              {actionError}
            </p>
          ) : null}

          <EventSeriesList
            eventSeries={listed}
            loading={loading}
            error={error}
            busyEventSeriesId={busyId}
            onEdit={(eventSeries) => setDialog({ kind: "form", eventSeries })}
            onDelete={handleDelete}
            onArchivedChange={(eventSeries, isArchived) =>
              writeEventSeries(eventSeries, { method: "PATCH", body: { isArchived } })
            }
            onReorder={(orderedIds) =>
              run(null, () => {
                // The list may be hiding archived event series, so the visible order is folded back
                // into the full one rather than sent on its own (see Ordering).
                const order = applyVisibleOrder(
                  eventSeries.map((eventSeries) => eventSeries.id),
                  orderedIds,
                );
                return apiRequest("/api/event-series", { method: "PATCH", body: { order } });
              }).then(() => {})
            }
          />
        </div>
      </BusyRegion>

      {dialog.kind === "form" ? (
        <EventSeriesFormDialog
          key={dialog.eventSeries?.id ?? "new"}
          open
          eventSeries={dialog.eventSeries}
          onSubmit={(name, eventSeries) =>
            run(eventSeries?.id ?? null, () =>
              eventSeries === null
                ? apiRequest("/api/event-series", { method: "POST", body: { name } })
                : apiRequest(`/api/event-series/${eventSeries.id}`, {
                    method: "PATCH",
                    body: { name },
                  }),
            ).then(() => {})
          }
          onClose={closeDialog}
          onSaved={closeDialog}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteEventSeriesDialog
          key={dialog.eventSeries.id}
          open
          eventSeries={dialog.eventSeries}
          onClose={closeDialog}
          onDeleted={closeDialog}
        />
      ) : null}
    </div>
  );
}
