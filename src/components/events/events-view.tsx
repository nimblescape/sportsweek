/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusyRegion } from "@/components/ui/busy-region";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
import { eventSchema, type Event } from "@/lib/schemas/season";
import { useEvents } from "@/lib/events/use-events";
import { useSeasons } from "@/lib/seasons/use-seasons";

const formSchema = z.object({ name: eventSchema.shape.name });
type FormValues = z.infer<typeof formSchema>;

/** What deleting an event costs beyond the event itself — said on the control and again in the dialog. */
const UNASSIGNS_STUDENTS_HINT =
  "Schüler:innen, die diesem Event zugeteilt sind, verlieren ihre Zuteilung.";

type OpenDialog =
  { kind: "none" } | { kind: "form"; event: Event | null } | { kind: "delete"; event: Event };

export function EventsView({ seasonId }: { seasonId: string }) {
  const { events, loading, error } = useEvents(seasonId);
  const { seasons } = useSeasons();
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  const { busyId, pending, run } = useRowAction();

  useBusyWhile(loading);

  const season = seasons.find((candidate) => candidate.id === seasonId) ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Link
        href="/app/master-data/seasons"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Alle Saisonen
      </Link>

      <BusyRegion busy={pending}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-lg font-semibold">
              Events – {season?.name ?? "Saison"}
            </h1>
            {/* An archived season is read-only, so nothing new can be attached to it (US-4). */}
            {season?.isArchived ? null : (
              <Button onClick={() => setDialog({ kind: "form", event: null })}>
                <Plus aria-hidden data-icon="inline-start" />
                Neues Event
              </Button>
            )}
          </div>

          <EventList
            events={events}
            loading={loading}
            error={error}
            readOnly={season?.isArchived ?? false}
            busyEventId={busyId}
            onEdit={(event) => setDialog({ kind: "form", event })}
            onDelete={(event) => setDialog({ kind: "delete", event })}
            onReorder={(order) =>
              run(null, () =>
                apiRequest("/api/events", { method: "PATCH", body: { seasonId, order } }),
              ).then(() => {})
            }
          />
        </div>
      </BusyRegion>

      {dialog.kind === "form" ? (
        <EventFormDialog
          event={dialog.event}
          onSubmit={(name, event) =>
            run(event?.id ?? null, () =>
              event === null
                ? apiRequest("/api/events", { method: "POST", body: { seasonId, name } })
                : apiRequest(`/api/events/${event.id}`, { method: "PATCH", body: { name } }),
            ).then(() => {})
          }
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteEventDialog
          event={dialog.event}
          onDelete={(event) =>
            run(event.id, () => apiRequest(`/api/events/${event.id}`, { method: "DELETE" }))
          }
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
    </div>
  );
}

type EventListProps = {
  events: Event[];
  loading: boolean;
  error: string | null;
  readOnly: boolean;
  /** The row a write is running on; its controls are held until the write is answered. */
  busyEventId: string | null;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
};

function EventList({
  events,
  loading,
  error,
  readOnly,
  busyEventId,
  onEdit,
  onDelete,
  onReorder,
}: EventListProps) {
  // The header spinner says the app is working; a second one on the list would say it twice.
  if (loading) return null;

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          Events konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">
          Diese Saison hat noch keine Events.
        </p>
      </Card>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <SortableList
        items={events}
        onReorder={onReorder}
        // An archived season is read-only, so its order is frozen along with everything else.
        disabled={readOnly}
        busyId={busyEventId}
        className="[&>li]:border-border [&>li]:border-b [&>li:last-child]:border-b-0"
        renderItem={(event) => (
          <div className="flex items-center justify-between gap-4 py-3 pr-4 pl-2">
            <span className="text-sm font-medium">{event.name}</span>

            {readOnly ? null : (
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip label="Bearbeiten">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={event.id === busyEventId}
                    aria-label={`Event ${event.name} bearbeiten`}
                    onClick={() => onEdit(event)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                </Tooltip>
                <Tooltip label={`Löschen. ${UNASSIGNS_STUDENTS_HINT}`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={event.id === busyEventId}
                    aria-label={`Event ${event.name} löschen`}
                    onClick={() => onDelete(event)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        )}
      />
    </Card>
  );
}

function EventFormDialog({
  event,
  onSubmit: save,
  onClose,
}: {
  event: Event | null;
  /** Rejects with an ApiRequestError; a CONFLICT is reported on the name field. */
  onSubmit: (name: string, event: Event | null) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = event !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const errorId = React.useId();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: event?.name ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await save(values.name, event);
      onClose();
    } catch (caught) {
      // A duplicate name belongs on the field, not in a detached alert (US-4).
      if (caught instanceof ApiRequestError && caught.code === "CONFLICT") {
        setError("name", { message: caught.message });
        return;
      }
      setSubmitError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  });

  return (
    <Dialog open title={isEdit ? "Event bearbeiten" : "Neues Event"} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? errorId : undefined}
            {...register("name")}
          />
          {errors.name ? (
            <p id={errorId} className="text-destructive text-sm">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        {submitError ? (
          <p role="alert" className="text-destructive text-sm">
            {submitError}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isEdit ? "Speichern" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteEventDialog({
  event,
  onDelete,
  onClose,
}: {
  event: Event;
  onDelete: (event: Event) => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(event);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open
      tone="destructive"
      title="Event löschen"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
            Löschen
          </Button>
        </>
      }
    >
      <p className="text-sm">
        Das Event <strong>{event.name}</strong> wird gelöscht. {UNASSIGNS_STUDENTS_HINT} Ihre
        Stammdaten bleiben erhalten.
      </p>
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
