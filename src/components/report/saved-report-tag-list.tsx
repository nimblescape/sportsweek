/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DraggingCursor } from "@/components/ui/dragging-cursor";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRowAction } from "@/lib/api/use-row-action";
import { useDroppedOrder } from "@/lib/ui/use-dropped-order";
import { sameSelection } from "@/lib/report/saved-reports";
import {
  savedReportSchema,
  type ReportSelection,
  type SavedReportEdit,
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
  /** Answers with the id of the report it saved, which the row then marks. */
  onSave: (name: string, selection: ReportSelection) => Promise<string | null>;
  onUpdate: (id: string, edit: SavedReportEdit) => Promise<void>;
  onRename: (id: string, edit: SavedReportEdit) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
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
  onReorder,
}: SavedReportTagListProps) {
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  // Remembered rather than derived from the selection, so the mark survives the changes a
  // teacher then makes — which is what keeps this report's controls, and its update, reachable.
  const [markedId, setMarkedId] = React.useState<string | null>(null);
  // Every tag is drawn from the reports one write is changing, so all of them wait for it.
  const { pending, run } = useRowAction();
  const { ordered, drop } = useDroppedOrder(reports, onReorder);

  const sensors = useSensors(
    // A short distance threshold, so a tap on a grip is not mistaken for the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const from = ordered.findIndex((report) => report.id === active.id);
    const to = ordered.findIndex((report) => report.id === over.id);
    if (from === -1 || to === -1) return;

    await drop(arrayMove(ordered, from, to).map((report) => report.id));
  }

  // Reaching for a control in a tag has moved on from naming a report to managing one.
  function closeForms() {
    setEditing(null);
    setConfirming(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <SortableContext items={ordered} strategy={rectSortingStrategy}>
        <DraggingCursor />
        <div role="group" aria-label={ROW_LABEL} className="flex flex-wrap items-center gap-1.5">
          {ordered.length === 0 && editing === null ? (
            <p className="text-muted-foreground text-sm">{EMPTY_HINT}</p>
          ) : (
            ordered.map((report) =>
              // Renaming happens where the tag is, so the row neither grows nor reorders itself.
              editing?.kind === "rename" && editing.report.id === report.id ? (
                <NameForm
                  key={report.id}
                  initialName={report.name}
                  submitLabel="Umbenennen"
                  pending={pending}
                  onSubmit={async (name) => {
                    await run(report.id, () => onRename(report.id, { name, ...current }));
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <SavedReportTag
                  key={report.id}
                  report={report}
                  marked={report.id === markedId}
                  changed={report.id === markedId && !sameSelection(report, current)}
                  confirming={confirming === report.id}
                  pending={pending}
                  onOpen={() => {
                    closeForms();
                    if (report.id === markedId) {
                      // Changed since it was opened: pressing its name puts it back, which is the
                      // only way to undo an edit without having remembered what it undid.
                      if (!sameSelection(report, current)) {
                        onOpen(report);
                        return;
                      }
                      // Otherwise the press lets go of the tag and leaves the two tag lists
                      // alone: what is on screen is the teacher's, not the tag's, to give back.
                      setMarkedId(null);
                      return;
                    }
                    setMarkedId(report.id);
                    onOpen(report);
                  }}
                  onUpdate={() => {
                    closeForms();
                    return run(report.id, () =>
                      onUpdate(report.id, { name: report.name, ...current }),
                    );
                  }}
                  onStartRename={() => {
                    closeForms();
                    setEditing({ kind: "rename", report });
                  }}
                  onStartDelete={() => {
                    closeForms();
                    setConfirming(report.id);
                  }}
                  onDelete={async () => {
                    await run(report.id, () => onDelete(report.id));
                    setConfirming(null);
                    setMarkedId(null);
                  }}
                  onCancel={() => setConfirming(null)}
                />
              ),
            )
          )}

          {editing?.kind === "save" ? (
            <NameForm
              initialName=""
              submitLabel="Speichern"
              pending={pending}
              onSubmit={async (name) => {
                // The report on screen is now the one just saved, so the mark follows it there.
                setMarkedId(await run(null, () => onSave(name, current)));
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => {
                setConfirming(null);
                // Naming a new report is a move away from the one that was open, not a change to it.
                setMarkedId(null);
                setEditing({ kind: "save" });
              }}
            >
              <Plus aria-hidden data-icon="inline-start" />
              Bericht speichern
            </Button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type SavedReportTagProps = {
  report: SavedReport;
  marked: boolean;
  changed: boolean;
  confirming: boolean;
  pending: boolean;
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
  pending,
  onOpen,
  onUpdate,
  onStartRename,
  onStartDelete,
  onDelete,
  onCancel,
}: SavedReportTagProps) {
  const hintId = React.useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: report.id,
    disabled: pending,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        // Three states, and the middle one is the point: opened, and since changed (US-13).
        buttonVariants({
          variant: marked ? (changed ? "secondary" : "default") : "outline",
          size: "lg",
        }),
        "gap-0.5 px-1",
        // The handle offers the grab; the tag itself is pressed, and only says so once a drag is
        // really under way.
        isDragging && "relative z-10 cursor-grabbing opacity-80",
      )}
    >
      {/* Both the grip and the tag start a pointer drag; the grip also carries the keyboard one.
          The tag's own press opens the report — a drag only starts once the pointer has moved,
          and the click that would follow one is swallowed by the sensor. */}
      <button
        type="button"
        aria-label={`${report.name} verschieben`}
        disabled={pending}
        className={cn(
          "focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-0.5 outline-none focus-visible:ring-3 active:cursor-grabbing disabled:cursor-default disabled:opacity-50",
          isDragging && "cursor-grabbing",
        )}
        {...attributes}
        onPointerDown={listeners?.onPointerDown as React.PointerEventHandler | undefined}
        onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler | undefined}
      >
        <GripVertical aria-hidden className="size-3.5" />
      </button>

      <button
        type="button"
        aria-pressed={marked}
        aria-label={`Gespeicherter Bericht: ${report.name}`}
        aria-describedby={changed ? hintId : undefined}
        disabled={pending}
        onPointerDown={listeners?.onPointerDown as React.PointerEventHandler | undefined}
        onClick={onOpen}
        className="focus-visible:ring-ring/50 max-w-60 touch-none truncate rounded-md px-1.5 outline-none focus-visible:ring-3 disabled:opacity-50"
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
            disabled={pending}
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
            disabled={pending}
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
              disabled={pending}
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
            disabled={pending}
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
            disabled={pending}
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
  /** The accessible name of the confirming icon, which is what the form is for. */
  submitLabel: string;
  /** Held by the row while its write is out, so a second name cannot be taken for the same one. */
  pending: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * The one place a report's name is typed — saving a new one and renaming an old one (US-13).
 * It stands in the row where the control that opened it stood, so naming a report neither moves
 * the tags nor adds a line under them.
 */
function NameForm({ initialName = "", submitLabel, pending, onSubmit, onCancel }: NameFormProps) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The schema owns the wording, so the hint beside the field is the one the server would send.
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
      return;
    }

    setError(null);
    try {
      await onSubmit(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5" noValidate>
      {/* Shaped as a tag, with its controls inside it, exactly as a tag being deleted is. */}
      <div className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-0.5 px-1")}>
        <Input
          autoFocus
          aria-label={NAME_LABEL}
          aria-invalid={error !== null}
          placeholder={NAME_LABEL}
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          className="h-7 w-40 rounded-md border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label={submitLabel}
          disabled={pending}
          className={ICON_CLASSES}
        >
          <Check aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Abbrechen"
          disabled={pending}
          onClick={onCancel}
          className={ICON_CLASSES}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
