/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { ArrowLeft, ArrowRight, GripVertical } from "lucide-react";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { Button } from "@/components/ui/button";
import { BusyRegion } from "@/components/ui/busy-region";
import {
  EMPTY_FILTER,
  filterStudents,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { cn } from "@/lib/utils";

/** The two drop targets, and the side a dragged student came from. */
const LISTS = { unassigned: "unassigned", assigned: "assigned" } as const;
type ListId = (typeof LISTS)[keyof typeof LISTS];

const UNASSIGNED_LABEL = "Nicht zugeteilt";

/**
 * A drop counts only where the pointer actually is, so releasing between the lists cancels
 * instead of snapping to the nearer one. A keyboard drag has no pointer, and then the nearest
 * list is the only thing to go by.
 */
const dropTarget: CollisionDetection = (args) =>
  args.pointerCoordinates === null ? closestCenter(args) : pointerWithin(args);

/**
 * One arrow key crosses to the other list rather than nudging by a few pixels, which would take
 * a dozen presses to get anywhere. Moving by button stays the shorter way round (US-12); this is
 * what keeps the handle from being a control only a pointer can use (see Drag and Drop).
 */
const crossToOtherList: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return undefined;

  const target = context.droppableRects.get(
    event.code === "ArrowRight" ? LISTS.assigned : LISTS.unassigned,
  );
  if (!target || !context.collisionRect) return undefined;

  return {
    x: currentCoordinates.x + (target.left - context.collisionRect.left),
    y: currentCoordinates.y,
  };
};

type TransferListsProps = {
  /** Null while no event is selected, which is the state the dialog starts in. */
  eventName: string | null;
  unassigned: readonly RosterStudent[];
  assigned: readonly RosterStudent[];
  groups: readonly FilterGroup[];
  onAssign: (recordIds: string[]) => Promise<void>;
  onUnassign: (recordIds: string[]) => Promise<void>;
};

/**
 * The two lists a teacher moves students between (US-12): everyone attending who has no event
 * yet on the left, the selected event's students on the right.
 *
 * There is no move from one event to another, by design — a student goes back to the left list
 * first. Which event the right list stands for is chosen above, so a direct move would have to
 * ask for a second one here.
 */
export function TransferLists({
  eventName,
  unassigned,
  assigned,
  groups,
  onAssign,
  onUnassign,
}: TransferListsProps) {
  const [unassignedFilter, setUnassignedFilter] = useState<StudentFilter>(EMPTY_FILTER);
  const [assignedFilter, setAssignedFilter] = useState<StudentFilter>(EMPTY_FILTER);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    // A short distance threshold, so a tap on a handle is not mistaken for the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: crossToOtherList }),
  );

  if (eventName === null) {
    return (
      <p className="text-muted-foreground text-sm">Wähle oben ein Event, um Schüler zuzuteilen.</p>
    );
  }

  const shownUnassigned = filterStudents(unassigned, unassignedFilter);
  const shownAssigned = filterStudents(assigned, assignedFilter);

  // The selection is what is both ticked and on screen, worked out rather than kept: a student
  // the filter hides, or one the last move took to the other side, is no longer part of it.
  const selectionIn = (students: readonly RosterStudent[]) =>
    students.filter((student) => picked.includes(student.id)).map((student) => student.id);

  const toAssign = selectionIn(shownUnassigned);
  const toUnassign = selectionIn(shownAssigned);

  async function move(recordIds: string[], transfer: (ids: string[]) => Promise<void>) {
    setMoving(true);
    setError(null);
    try {
      await transfer(recordIds);
      setPicked([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    } finally {
      setMoving(false);
    }
  }

  const togglePicked = (recordId: string) =>
    setPicked((current) =>
      current.includes(recordId) ? current.filter((id) => id !== recordId) : [...current, recordId],
    );

  function handleDragEnd({ active, over }: DragEndEvent) {
    const from = active.data.current?.list as ListId | undefined;
    // No target, or the list it started in: a cancelled drag changes nothing.
    if (!over || from === undefined || over.id === from) return;

    const recordId = String(active.id);
    // A student who is part of the selection takes it along, exactly as the move button does;
    // one who is not travels alone.
    const selection = from === LISTS.unassigned ? toAssign : toUnassign;
    const moved = selection.includes(recordId) ? selection : [recordId];

    void move(moved, over.id === LISTS.assigned ? onAssign : onUnassign);
  }

  return (
    <div className="space-y-2">
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <BusyRegion busy={moving}>
        <DndContext sensors={sensors} collisionDetection={dropTarget} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
            <StudentList
              listId={LISTS.unassigned}
              label={UNASSIGNED_LABEL}
              students={shownUnassigned}
              groups={groups}
              filter={unassignedFilter}
              onFilterChange={setUnassignedFilter}
              picked={picked}
              onToggle={togglePicked}
            />

            <div className="flex justify-center gap-2 md:flex-col md:pt-28">
              <Button
                type="button"
                size="icon"
                aria-label="Auswahl zuteilen"
                disabled={toAssign.length === 0}
                onClick={() => void move(toAssign, onAssign)}
              >
                <ArrowRight aria-hidden className="max-md:rotate-90" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zuteilung aufheben"
                disabled={toUnassign.length === 0}
                onClick={() => void move(toUnassign, onUnassign)}
              >
                <ArrowLeft aria-hidden className="max-md:rotate-90" />
              </Button>
            </div>

            <StudentList
              listId={LISTS.assigned}
              label={`Zugeteilt: ${eventName}`}
              students={shownAssigned}
              groups={groups}
              filter={assignedFilter}
              onFilterChange={setAssignedFilter}
              picked={picked}
              onToggle={togglePicked}
            />
          </div>
        </DndContext>
      </BusyRegion>
    </div>
  );
}

type StudentListProps = {
  listId: ListId;
  label: string;
  students: readonly RosterStudent[];
  groups: readonly FilterGroup[];
  filter: StudentFilter;
  onFilterChange: (next: StudentFilter) => void;
  picked: readonly string[];
  onToggle: (recordId: string) => void;
};

function StudentList({
  listId,
  label,
  students,
  groups,
  filter,
  onFilterChange,
  picked,
  onToggle,
}: StudentListProps) {
  const { setNodeRef, isOver } = useDroppable({ id: listId });

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "border-border rounded-lg border p-3 shadow-sm",
        isOver && "border-ring ring-ring/50 ring-3",
      )}
    >
      <h3 className="font-heading mb-2 text-sm font-semibold">{label}</h3>

      <FilterTagList label={label} groups={groups} value={filter} onChange={onFilterChange} />

      <ul className="divide-border mt-3 max-h-72 divide-y overflow-y-auto">
        {students.map((student) => (
          <StudentRow
            key={student.id}
            student={student}
            listId={listId}
            picked={picked.includes(student.id)}
            onToggle={onToggle}
          />
        ))}
      </ul>

      <p className="text-muted-foreground mt-2 text-xs">{students.length} angezeigt</p>
    </section>
  );
}

function StudentRow({
  student,
  listId,
  picked,
  onToggle,
}: {
  student: RosterStudent;
  listId: ListId;
  picked: boolean;
  onToggle: (recordId: string) => void;
}) {
  const name = `${student.lastName} ${student.firstName}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: student.id,
    data: { list: listId },
  });

  return (
    <li ref={setNodeRef} className={cn("flex items-center", isDragging && "bg-muted opacity-80")}>
      <button
        type="button"
        aria-label={`${name} verschieben`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-1 transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2 px-1 py-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={picked}
          onChange={() => onToggle(student.id)}
        />
        {name}
      </label>
    </li>
  );
}
