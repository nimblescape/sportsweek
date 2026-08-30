/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import type { EventSeries } from "@/lib/schemas/event-series";
import { IRREVERSIBLE_HINT } from "@/lib/ui/hints";

type DeleteEventSeriesDialogProps = {
  open: boolean;
  eventSeries: EventSeries;
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * A warning dialog per the Design Guidelines — one of the few places red is allowed.
 *
 * Deleting is irreversible either way, so it is always asked. Where there are registrations to
 * lose, the name has to be typed as well, and it is compared verbatim: case and stray spaces must
 * match, so the confirmation cannot be cleared by muscle memory (US-4).
 */
export function DeleteEventSeriesDialog({
  open,
  eventSeries,
  onClose,
  onDeleted,
}: DeleteEventSeriesDialogProps) {
  // Mounted only while open and keyed by event series, so the confirmation always starts empty.
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const fieldId = React.useId();

  const matches = !eventSeries.hasRegistrations || confirmation === eventSeries.name;

  async function handleDelete() {
    if (!matches) return;

    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/event-series/${eventSeries.id}`, { method: "DELETE" });
      onDeleted();
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
      open={open}
      tone="destructive"
      title="Eventreihe löschen"
      onClose={onClose}
      description={
        <span className="flex gap-2">
          <TriangleAlert aria-hidden className="text-destructive mt-0.5 size-4 shrink-0" />
          <span>
            Die Eventreihe <strong className="text-foreground">{eventSeries.name}</strong> wird mit
            allen Events, Stammdaten und Berichten
            {eventSeries.hasRegistrations
              ? " sowie allen Registrierungen der Schüler:innen"
              : ""}{" "}
            gelöscht. {IRREVERSIBLE_HINT}
          </span>
        </span>
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || deleting}
            onClick={handleDelete}
          >
            Löschen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {eventSeries.hasRegistrations ? (
          <>
            <Label htmlFor={fieldId}>Zum Bestätigen den Name der Eventreihe eingeben</Label>
            <Input
              id={fieldId}
              autoFocus
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
