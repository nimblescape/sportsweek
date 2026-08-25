"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import type { Season } from "@/lib/schemas/season";

type DeleteSeasonDialogProps = {
  open: boolean;
  season: Season;
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * A warning dialog per the Design Guidelines — one of the few places red is allowed.
 * The typed name is compared verbatim: case and stray spaces must match, so the
 * confirmation cannot be cleared by muscle memory (US-4).
 */
export function DeleteSeasonDialog({ open, season, onClose, onDeleted }: DeleteSeasonDialogProps) {
  // Mounted only while open and keyed by season, so the confirmation always starts empty.
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const fieldId = React.useId();

  const matches = confirmation === season.name;

  async function handleDelete() {
    if (!matches) return;

    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/seasons/${season.id}`, { method: "DELETE" });
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
      title="Saison löschen"
      onClose={onClose}
      description={
        <span className="flex gap-2">
          <TriangleAlert aria-hidden className="text-destructive mt-0.5 size-4 shrink-0" />
          <span>
            Die Saison <strong className="text-foreground">{season.name}</strong> wird mit allen
            Events und allen Stammdaten der Schülerinnen und Schüler gelöscht. Das kann nicht
            rückgängig gemacht werden.
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
        <Label htmlFor={fieldId}>Zum Bestätigen den Name der Saison eingeben</Label>
        <Input
          id={fieldId}
          autoFocus
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
