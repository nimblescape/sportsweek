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
import { Button } from "@/components/ui/button";
import { NameForm } from "@/components/ui/name-form";
import { Tag, TagAction, TagName } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import { DraggingCursor } from "@/components/ui/dragging-cursor";
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
const CHANGED_HINT = "Geändert gegenüber dem gespeicherten Bericht.";

export const MAY_NOT_EDIT_HINT = "Du darfst Berichte ansehen, aber nicht speichern.";

type SavedReportTagListProps = {
  reports: readonly SavedReport[];
  /** What a save would keep: the report as it currently stands, both tag rows (US-13). */
  current: ReportSelection;
  /** Saved reports are shared, so anyone may open one; keeping one is its own permission (US-2). */
  mayEdit: boolean;
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
  mayEdit,
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
  const refusalId = React.useId();

  /**
   * A marked tag that no longer matches the screen reads as "changed", and what a teacher does
   * about that is store the change. Somebody who may not store one has nothing to do about it,
   * so the mark is released instead and the row goes back to saying that none of them is open.
   */
  const marked = reports.find((report) => report.id === markedId) ?? null;
  if (!mayEdit && marked !== null && !sameSelection(marked, current)) setMarkedId(null);
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
          {ordered.map((report) =>
            // Renaming happens where the tag is, so the row neither grows nor reorders itself.
            editing?.kind === "rename" && editing.report.id === report.id ? (
              <NameForm
                key={report.id}
                schema={nameSchema}
                label={NAME_LABEL}
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
                mayEdit={mayEdit}
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
          )}

          {editing?.kind === "save" ? (
            <NameForm
              schema={nameSchema}
              label={NAME_LABEL}
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
            <Tooltip label={mayEdit ? "" : MAY_NOT_EDIT_HINT}>
              {/* A disabled button emits no pointer events, so the reason hangs on a wrapper. */}
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || !mayEdit}
                  aria-describedby={mayEdit ? undefined : refusalId}
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
              </span>
            </Tooltip>
          )}
          {mayEdit ? null : (
            <span id={refusalId} className="sr-only">
              {MAY_NOT_EDIT_HINT}
            </span>
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
  mayEdit: boolean;
  onOpen: () => void;
  onUpdate: () => Promise<void>;
  onStartRename: () => void;
  onStartDelete: () => void;
  onDelete: () => Promise<void>;
  onCancel: () => void;
};

function SavedReportTag({
  report,
  marked,
  changed,
  confirming,
  pending,
  mayEdit,
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
    disabled: pending || !mayEdit,
  });

  return (
    <Tag
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      pressed={marked}
      // Three states, and the middle one is the point: opened, and since changed (US-13).
      variant={changed ? "neutral" : "default"}
      disabled={pending}
      // Both the grip and the tag start a pointer drag; the grip also carries the keyboard one.
      // The tag's own press opens the report — a drag only starts once the pointer has moved,
      // and the click that would follow one is swallowed by the sensor.
      onPointerDown={listeners?.onPointerDown as React.PointerEventHandler | undefined}
      // The handle offers the grab; the tag itself only says so once a drag is really under way.
      className={cn("touch-none", isDragging && "relative z-10 cursor-grabbing opacity-80")}
    >
      {/* The order is stored, so the grip is only there for somebody who may store one. */}
      {mayEdit ? (
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
      ) : null}

      <TagName
        label={`Gespeicherter Bericht: ${report.name}`}
        text={report.name}
        describedBy={changed ? hintId : undefined}
        onPress={onOpen}
      />
      {/* The colour says it to everybody who can see it; this says it to everybody else. */}
      {changed ? (
        <span id={hintId} className="sr-only">
          {CHANGED_HINT}
        </span>
      ) : null}

      {/* Only the marked tag is managed, so there is nothing on the others to press by accident. */}
      {!marked || !mayEdit ? null : confirming ? (
        <>
          <TagAction label={`Löschen von ${report.name} bestätigen`} onClick={onDelete}>
            <Check aria-hidden />
          </TagAction>
          <TagAction label={`Löschen von ${report.name} abbrechen`} onClick={onCancel}>
            <X aria-hidden />
          </TagAction>
        </>
      ) : (
        <>
          {/* Nothing to store while the report on screen still is the one this tag holds. */}
          {changed ? (
            <TagAction label={`Bericht ${report.name} aktualisieren`} onClick={onUpdate}>
              <Save aria-hidden />
            </TagAction>
          ) : null}
          <TagAction label={`Bericht ${report.name} umbenennen`} onClick={onStartRename}>
            <Pencil aria-hidden />
          </TagAction>
          <TagAction label={`Bericht ${report.name} löschen`} onClick={onStartDelete}>
            <Trash2 aria-hidden />
          </TagAction>
        </>
      )}
    </Tag>
  );
}
