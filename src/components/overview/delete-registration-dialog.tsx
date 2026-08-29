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
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import type { RosterStudent } from "@/lib/students/roster";

type DeleteRegistrationDialogProps = {
  open: boolean;
  eventSeriesId: string;
  student: RosterStudent;
  onClose: () => void;
  onDeleted: () => void;
};

export const DELETE_REGISTRATION_TITLE = "Anmeldung löschen";

/**
 * A warning dialog per the Design Guidelines, for one record rather than a whole series (US-28).
 *
 * It does not ask for the name to be typed back, as deleting a series does (US-19): the name is
 * already on the screen in front of the teacher, and one registration is not that much to undo.
 * It is still a dialog rather than the inline confirmation a saved report gets, because what is
 * destroyed is somebody else's work.
 */
export function DeleteRegistrationDialog({
  open,
  eventSeriesId,
  student,
  onClose,
  onDeleted,
}: DeleteRegistrationDialogProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const name = `${student.lastName} ${student.firstName}`;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(
        `/api/event-series/${eventSeriesId}/registrations/${encodeURIComponent(student.id)}`,
        { method: "DELETE" },
      );
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
      title={DELETE_REGISTRATION_TITLE}
      onClose={onClose}
      description={
        <span className="flex gap-2">
          <TriangleAlert aria-hidden className="text-destructive mt-0.5 size-4 shrink-0" />
          <span>
            Die Anmeldung von <strong className="text-foreground">{name}</strong> wird mit allen
            Antworten gelöscht. Das kann nicht rückgängig gemacht werden.
          </span>
        </span>
      }
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
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
