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
import { GripVertical } from "lucide-react";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { BusyRegion } from "@/components/ui/busy-region";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EMPTY_FILTER,
  filterStudents,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { cn } from "@/lib/utils";

/** The two drop targets, and the list a dragged student came from. */
const LISTS = { unassigned: "unassigned", assigned: "assigned" } as const;
type ListId = (typeof LISTS)[keyof typeof LISTS];

const UNASSIGNED_LABEL = "Nicht zugeteilt";

/** Selects everyone the filter currently leaves; not a student, so it never travels itself. */
const ALL_LABEL = "Alle";

/** The filter's first tag reads "Alle" too, so this one says what it does instead. */
const ALL_NAME = "Alle auswählen";

/**
 * A drop counts only where the pointer actually is, so releasing between the lists cancels
 * instead of snapping to the nearer one. A keyboard drag has no pointer, and then the nearest
 * list is the only thing to go by.
 */
const dropTarget: CollisionDetection = (args) =>
  args.pointerCoordinates === null ? closestCenter(args) : pointerWithin(args);

/**
 * The lists sit one above the other, so one arrow key crosses to the other rather than nudging
 * by a few pixels. Dragging is the only way a student changes list (US-12), which makes this the
 * gesture that keeps the dialog usable without a pointer.
 */
const crossToOtherList: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return undefined;

  const target = context.droppableRects.get(
    event.code === "ArrowDown" ? LISTS.assigned : LISTS.unassigned,
  );
  if (!target || !context.collisionRect) return undefined;

  return {
    x: currentCoordinates.x,
    y: currentCoordinates.y + (target.top - context.collisionRect.top),
  };
};

type TransferListsProps = {
  /** Null while no week is selected, which is the state the dialog starts in. */
  eventName: string | null;
  unassigned: readonly RosterStudent[];
  assigned: readonly RosterStudent[];
  groups: readonly FilterGroup[];
  onAssign: (recordIds: string[]) => Promise<void>;
  onUnassign: (recordIds: string[]) => Promise<void>;
};

/**
 * The two lists a teacher moves students between (US-12): everyone attending who has no week
 * yet on top, the selected week's students below.
 *
 * There is no move from one week to another, by design — a student goes back to the upper list
 * first. Which week the lower list stands for is chosen above, so a direct move would have to
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
      <p className="text-muted-foreground text-sm">Wähle oben eine Woche, um Schüler zuzuteilen.</p>
    );
  }

  const shownUnassigned = filterStudents(unassigned, unassignedFilter);
  const shownAssigned = filterStudents(assigned, assignedFilter);

  async function move(recordIds: string[], transfer: (ids: string[]) => Promise<void>) {
    setMoving(true);
    setError(null);
    try {
      await transfer(recordIds);
      // Only what moved: a student picked in the other list is still picked there.
      setPicked((current) => current.filter((id) => !recordIds.includes(id)));
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

  const toggleAll = (students: readonly RosterStudent[], allPicked: boolean) =>
    setPicked((current) => {
      const shown = students.map((student) => student.id);
      return allPicked
        ? current.filter((id) => !shown.includes(id))
        : [...current, ...shown.filter((id) => !current.includes(id))];
    });

  function handleDragEnd({ active, over }: DragEndEvent) {
    const from = active.data.current?.list as ListId | undefined;
    // No target, or the list it started in: a cancelled drag changes nothing.
    if (!over || from === undefined || over.id === from) return;

    const recordId = String(active.id);
    const source = from === LISTS.unassigned ? unassigned : assigned;
    // A student who is part of the selection takes it along, filtered out of sight or not; one
    // who is not travels alone.
    const selection = source.filter((student) => picked.includes(student.id)).map((s) => s.id);
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
          <div className="flex flex-col gap-3">
            <StudentList
              listId={LISTS.unassigned}
              label={UNASSIGNED_LABEL}
              students={shownUnassigned}
              groups={groups}
              filter={unassignedFilter}
              onFilterChange={setUnassignedFilter}
              picked={picked}
              onToggle={togglePicked}
              onToggleAll={toggleAll}
            />

            <StudentList
              listId={LISTS.assigned}
              // The card above already carries the week's name, so the title says only which
              // week this is; the accessible name still says what the list holds.
              label={`Zugeteilt: ${eventName}`}
              title={eventName}
              students={shownAssigned}
              groups={groups}
              filter={assignedFilter}
              onFilterChange={setAssignedFilter}
              picked={picked}
              onToggle={togglePicked}
              onToggleAll={toggleAll}
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
  /** What the card shows; the label is what it is called, which may say more. */
  title?: string;
  students: readonly RosterStudent[];
  groups: readonly FilterGroup[];
  filter: StudentFilter;
  onFilterChange: (next: StudentFilter) => void;
  picked: readonly string[];
  onToggle: (recordId: string) => void;
  onToggleAll: (students: readonly RosterStudent[], allPicked: boolean) => void;
};

function StudentList({
  listId,
  label,
  title = label,
  students,
  groups,
  filter,
  onFilterChange,
  picked,
  onToggle,
  onToggleAll,
}: StudentListProps) {
  const { setNodeRef, isOver } = useDroppable({ id: listId });
  const allPicked = students.length > 0 && students.every((student) => picked.includes(student.id));

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      role="group"
      aria-label={label}
      className={cn("transition-shadow", isOver && "ring-ring ring-2")}
    >
      <CardHeader>
        {/* The count is what the filter leaves, not what the list holds (US-12). */}
        <CardTitle>{`${title}: ${students.length}`}</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <ul className="max-h-72 overflow-y-auto">
            <li>
              <Row
                name={ALL_LABEL}
                label={ALL_NAME}
                picked={allPicked}
                onToggle={() => onToggleAll(students, allPicked)}
              />
            </li>
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
        </div>

        <FilterTagList label={label} groups={groups} value={filter} onChange={onFilterChange} />
      </CardContent>
    </Card>
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
    <li ref={setNodeRef} className={cn(isDragging && "opacity-80")}>
      <Row name={name} picked={picked} onToggle={() => onToggle(student.id)}>
        <button
          type="button"
          aria-label={`${name} verschieben`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-1 transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      </Row>
    </li>
  );
}

/** Picked is shown by colouring the row, so there is no box to tick (US-12). */
function Row({
  name,
  label,
  picked,
  onToggle,
  children,
}: {
  name: string;
  label?: string;
  picked: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center rounded-md", picked && "bg-accent")}>
      {children ?? <span aria-hidden className="size-6 shrink-0" />}
      <button
        type="button"
        aria-label={label}
        aria-pressed={picked}
        onClick={onToggle}
        className="focus-visible:ring-ring/50 flex-1 rounded-md px-1 py-2 text-left text-sm outline-none focus-visible:ring-3"
      >
        {name}
      </button>
    </div>
  );
}
