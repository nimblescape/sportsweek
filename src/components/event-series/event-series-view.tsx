/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { DeleteEventSeriesDialog } from "@/components/event-series/delete-event-series-dialog";
import { EventSeriesFormDialog } from "@/components/event-series/event-series-form-dialog";
import { EventSeriesList } from "@/components/event-series/event-series-list";
import { RecordScreen } from "@/components/master-data/record-screen";
import { apiRequest, ApiRequestError, type RequestOptions } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { applyVisibleOrder } from "@/lib/schemas/position";
import type { EventSeries } from "@/lib/schemas/event-series";
import { visibleEventSeries } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import { useShowArchived } from "@/lib/event-series/show-archived";
import { ROOT_TABS, rootTrail } from "@/lib/master-data/hierarchy";
import { Tag, TagName } from "@/components/ui/tag";

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

  // Irreversible either way, so it is always asked; the dialog decides whether the name has to
  // be typed out as well (US-4).
  function handleDelete(eventSeries: EventSeries) {
    setDialog({ kind: "delete", eventSeries });
  }

  return (
    <>
      <RecordScreen
        trail={rootTrail()}
        tabs={ROOT_TABS}
        marked={ROOT_TABS[0].key}
        busy={pending}
        onAdd={() => setDialog({ kind: "form", eventSeries: null })}
      >
        <div>
          <Tag pressed={showArchived}>
            <TagName
              label="Archivierte Eventreihen anzeigen"
              onPress={() => setShowArchived(!showArchived)}
            />
          </Tag>
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
      </RecordScreen>

      {dialog.kind === "form" ? (
        <EventSeriesFormDialog
          key={dialog.eventSeries?.id ?? "new"}
          open
          eventSeries={dialog.eventSeries}
          // Every one of them, archived included: naming an archived series as the source is how
          // the master data in it comes back into something that can be edited (US-22).
          sources={eventSeries}
          onSubmit={(values, existing) =>
            run(existing?.id ?? null, () =>
              existing === null
                ? apiRequest("/api/event-series", { method: "POST", body: values })
                : apiRequest(`/api/event-series/${existing.id}`, {
                    method: "PATCH",
                    body: { name: values.name },
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
    </>
  );
}
