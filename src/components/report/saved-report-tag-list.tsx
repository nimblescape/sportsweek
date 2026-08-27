/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchingSavedReport } from "@/lib/report/saved-reports";
import {
  savedReportSchema,
  type ReportSelection,
  type SavedReport,
} from "@/lib/schemas/saved-report";
import { useHoverCapability } from "@/lib/ui/use-hover-capability";

const nameSchema = savedReportSchema.shape.name;

const ROW_LABEL = "Gespeicherte Berichte";
const NAME_LABEL = "Name des Berichts";
const EMPTY_HINT = "Noch keine Berichte gespeichert.";

type SavedReportTagListProps = {
  reports: readonly SavedReport[];
  /** What a save would keep: the report as it currently stands, both tag rows (US-13). */
  current: ReportSelection;
  onOpen: (selection: ReportSelection) => void;
  onSave: (name: string, selection: ReportSelection) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type Editing = { kind: "save" } | { kind: "rename"; report: SavedReport };

/**
 * The saved reports of US-13, as a third tag row above the two that make one up: pressing a tag
 * puts that report back on screen, and the controls for renaming and removing it sit in the tag
 * itself rather than on a page of their own. They are shared among all teachers, so the row is
 * the same one for everybody and any teacher may edit any tag.
 */
export function SavedReportTagList({
  reports,
  current,
  onOpen,
  onSave,
  onRename,
  onDelete,
}: SavedReportTagListProps) {
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);

  // Derived, not remembered: the tag stops being the pressed one as soon as either row is
  // changed, because by then the report on screen is no longer the one that was saved.
  const selected = matchingSavedReport(reports, current);

  return (
    <div className="space-y-2">
      <div role="group" aria-label={ROW_LABEL} className="flex flex-wrap items-center gap-1.5">
        {reports.length === 0 ? (
          <p className="text-muted-foreground text-sm">{EMPTY_HINT}</p>
        ) : (
          reports.map((report) => (
            <SavedReportTag
              key={report.id}
              report={report}
              pressed={report.id === selected?.id}
              confirming={confirming === report.id}
              onOpen={() => onOpen(report)}
              onStartRename={() => {
                setConfirming(null);
                setEditing({ kind: "rename", report });
              }}
              onStartDelete={() => {
                setEditing(null);
                setConfirming(report.id);
              }}
              onDelete={async () => {
                await onDelete(report.id);
                setConfirming(null);
              }}
              onCancel={() => setConfirming(null)}
            />
          ))
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setConfirming(null);
            setEditing(editing?.kind === "save" ? null : { kind: "save" });
          }}
        >
          <Plus aria-hidden data-icon="inline-start" />
          Bericht speichern
        </Button>
      </div>

      {editing !== null ? (
        <NameForm
          key={editing.kind === "rename" ? editing.report.id : "save"}
          initialName={editing.kind === "rename" ? editing.report.name : ""}
          submitLabel={editing.kind === "rename" ? "Umbenennen" : "Speichern"}
          onSubmit={async (name) => {
            if (editing.kind === "rename") await onRename(editing.report.id, name);
            else await onSave(name, current);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

type SavedReportTagProps = {
  report: SavedReport;
  pressed: boolean;
  confirming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onStartDelete: () => void;
  onDelete: () => Promise<void>;
  onCancel: () => void;
};

function SavedReportTag({
  report,
  pressed,
  confirming,
  onOpen,
  onStartRename,
  onStartDelete,
  onDelete,
  onCancel,
}: SavedReportTagProps) {
  const canHover = useHoverCapability();

  // Revealed on hover where there is one; on a touch screen there is none, and a control nobody
  // can reveal is a control nobody has (see General). A tag being confirmed shows them anyway.
  const iconClasses = cn(
    // The tag carries the colour, so an icon in it neither repaints itself nor its background.
    "hover:bg-transparent hover:text-inherit hover:opacity-70",
    canHover &&
      !confirming &&
      "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
  );

  return (
    <div
      className={cn(
        buttonVariants({ variant: pressed ? "default" : "outline", size: "lg" }),
        "group gap-0.5 px-1",
      )}
    >
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={`Gespeicherter Bericht: ${report.name}`}
        onClick={onOpen}
        className="focus-visible:ring-ring/50 max-w-60 truncate rounded-md px-1.5 outline-none focus-visible:ring-3"
      >
        {report.name}
      </button>

      {confirming ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Löschen von ${report.name} bestätigen`}
            onClick={onDelete}
            className={iconClasses}
          >
            <Check aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Löschen von ${report.name} abbrechen`}
            onClick={onCancel}
            className={iconClasses}
          >
            <X aria-hidden />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bericht ${report.name} umbenennen`}
            onClick={onStartRename}
            className={iconClasses}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bericht ${report.name} löschen`}
            onClick={onStartDelete}
            className={iconClasses}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}

type NameFormProps = {
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

/** The one place a report's name is typed — saving a new one and renaming an old one (US-13). */
function NameForm({ initialName = "", submitLabel, onSubmit, onCancel }: NameFormProps) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The schema owns the wording, so the hint under the field is the one the server would send.
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-2" noValidate>
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          aria-label={NAME_LABEL}
          placeholder={NAME_LABEL}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-64"
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" aria-label="Abbrechen" onClick={onCancel}>
        Abbrechen
      </Button>
    </form>
  );
}
