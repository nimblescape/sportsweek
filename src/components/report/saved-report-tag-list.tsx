/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sameSelection } from "@/lib/report/saved-reports";
import {
  savedReportSchema,
  type ReportSelection,
  type SavedReport,
} from "@/lib/schemas/saved-report";

const nameSchema = savedReportSchema.shape.name;

const ROW_LABEL = "Gespeicherte Berichte";
const NAME_LABEL = "Name des Berichts";
const EMPTY_HINT = "Noch keine Berichte gespeichert.";
const CHANGED_HINT = "Geändert gegenüber dem gespeicherten Bericht.";

type SavedReportTagListProps = {
  reports: readonly SavedReport[];
  /** What a save would keep: the report as it currently stands, both tag rows (US-13). */
  current: ReportSelection;
  onOpen: (selection: ReportSelection) => void;
  onSave: (name: string, selection: ReportSelection) => Promise<void>;
  onUpdate: (id: string, selection: ReportSelection) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type Editing = { kind: "save" } | { kind: "rename"; report: SavedReport };

/**
 * The saved reports of US-13, as a third tag row above the two that make one up: pressing a tag
 * puts that report back on screen, and the controls for keeping it sit in the tag itself rather
 * than on a page of their own. They are shared among all teachers, so the row is the same one
 * for everybody and any teacher may edit any tag.
 */
export function SavedReportTagList({
  reports,
  current,
  onOpen,
  onSave,
  onUpdate,
  onRename,
  onDelete,
}: SavedReportTagListProps) {
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  // Remembered rather than derived from the selection, so the mark survives the changes a
  // teacher then makes — which is what keeps this report's controls, and its update, reachable.
  const [markedId, setMarkedId] = React.useState<string | null>(null);

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
              marked={report.id === markedId}
              changed={report.id === markedId && !sameSelection(report, current)}
              confirming={confirming === report.id}
              onOpen={() => {
                setConfirming(null);
                setEditing(null);
                setMarkedId(report.id);
                onOpen(report);
              }}
              onUpdate={() => onUpdate(report.id, current)}
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
                setMarkedId(null);
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
            if (editing.kind === "rename") {
              await onRename(editing.report.id, name);
            } else {
              await onSave(name, current);
              // What was open is not what was just saved, so the row lets go of it.
              setMarkedId(null);
            }
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
  marked: boolean;
  changed: boolean;
  confirming: boolean;
  onOpen: () => void;
  onUpdate: () => Promise<void>;
  onStartRename: () => void;
  onStartDelete: () => void;
  onDelete: () => Promise<void>;
  onCancel: () => void;
};

// The tag carries the colour, so an icon in it neither repaints itself nor its background.
const ICON_CLASSES = "hover:bg-transparent hover:text-inherit hover:opacity-70";

function SavedReportTag({
  report,
  marked,
  changed,
  confirming,
  onOpen,
  onUpdate,
  onStartRename,
  onStartDelete,
  onDelete,
  onCancel,
}: SavedReportTagProps) {
  const hintId = React.useId();

  return (
    <div
      className={cn(
        // Three states, and the middle one is the point: opened, and since changed (US-13).
        buttonVariants({
          variant: marked ? (changed ? "secondary" : "default") : "outline",
          size: "lg",
        }),
        "gap-0.5 px-1",
      )}
    >
      <button
        type="button"
        aria-pressed={marked}
        aria-label={`Gespeicherter Bericht: ${report.name}`}
        aria-describedby={changed ? hintId : undefined}
        onClick={onOpen}
        className="focus-visible:ring-ring/50 max-w-60 truncate rounded-md px-1.5 outline-none focus-visible:ring-3"
      >
        {report.name}
      </button>

      {/* The colour says it to everybody who can see it; this says it to everybody else. */}
      {changed ? (
        <span id={hintId} className="sr-only">
          {CHANGED_HINT}
        </span>
      ) : null}

      {/* Only the marked tag is managed, so there is nothing on the others to press by accident. */}
      {!marked ? null : confirming ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Löschen von ${report.name} bestätigen`}
            onClick={onDelete}
            className={ICON_CLASSES}
          >
            <Check aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Löschen von ${report.name} abbrechen`}
            onClick={onCancel}
            className={ICON_CLASSES}
          >
            <X aria-hidden />
          </Button>
        </>
      ) : (
        <>
          {/* Nothing to store while the report on screen still is the one this tag holds. */}
          {changed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Bericht ${report.name} aktualisieren`}
              onClick={onUpdate}
              className={ICON_CLASSES}
            >
              <Save aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bericht ${report.name} umbenennen`}
            onClick={onStartRename}
            className={ICON_CLASSES}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bericht ${report.name} löschen`}
            onClick={onStartDelete}
            className={ICON_CLASSES}
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
