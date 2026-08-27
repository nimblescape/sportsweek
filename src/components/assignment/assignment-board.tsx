/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  UNASSIGNED_GROUP,
  type AssignmentGroup,
  type SkillColumn,
} from "@/lib/assignment/statistics";
import {
  EMPTY_FILTER,
  filterStudents,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { DraggingCursor } from "@/components/ui/dragging-cursor";
import { ALL_LABEL, AssignmentCard, DraggedTag, studentTagName } from "./assignment-card";

const NOTHING_CARRIED: ReadonlySet<string> = new Set();

/**
 * A drop counts only where the pointer actually is, so releasing between two cards cancels
 * instead of snapping to the nearer one. A keyboard drag has no pointer, and then the nearest
 * card is the only thing to go by.
 */
const dropTarget: CollisionDetection = (args) =>
  args.pointerCoordinates === null ? closestCenter(args) : pointerWithin(args);

/**
 * The cards are stacked, so one arrow key moves the drag to the next card down or up rather than
 * nudging it by a few pixels. Dragging is the only way a student changes card (US-12), which
 * makes this the gesture that keeps the board usable without a pointer.
 */
const crossToNextCard: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return undefined;

  const current = context.collisionRect;
  if (!current) return undefined;

  const tops = [...context.droppableRects.values()].map((rect) => rect.top).sort((a, b) => a - b);
  const next =
    event.code === "ArrowDown"
      ? tops.find((top) => top > current.top)
      : tops.reverse().find((top) => top < current.top);
  if (next === undefined) return undefined;

  return { x: currentCoordinates.x, y: currentCoordinates.y + (next - current.top) };
};

type AssignmentBoardProps = {
  groups: readonly AssignmentGroup[];
  programs: readonly string[];
  skillLevels: readonly string[];
  /** The columns the groups were counted with; a card recounts with them when its filter applies. */
  columns: readonly SkillColumn[];
  /** Everyone registered for the event series, taking part or not — what "Teilnahme" is measured against. */
  registered: readonly RosterStudent[];
  filterGroups: readonly FilterGroup[];
  /** Given the students to move and the week to move them to, or null to take the week away. */
  onMove: (recordIds: string[], eventId: string | null) => Promise<void>;
};

/**
 * The assignment board of US-12: one card per week plus the card of students who have none yet,
 * all built alike, with students dragged straight from any card to any other.
 *
 * The selection and the filters live here rather than in the cards, so a card can say what its
 * own filter leaves while the drag still knows everything that was picked in it.
 */
export function AssignmentBoard({
  groups,
  programs,
  skillLevels,
  columns,
  registered,
  filterGroups,
  onMove,
}: AssignmentBoardProps) {
  const [filters, setFilters] = useState<Readonly<Record<string, StudentFilter>>>({});
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // What a drag is carrying: the ids to fade where they stand, and the tags to draw under the
  // pointer. The tag that was grabbed is one of them, "Alle" included — it travels too.
  const [drag, setDrag] = useState<{
    ids: ReadonlySet<string>;
    names: readonly string[];
    overlay: boolean;
  } | null>(null);

  const carried = drag?.ids ?? NOTHING_CARRIED;

  const sensors = useSensors(
    // A short distance threshold, so a tap on a row is not mistaken for the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: crossToNextCard }),
  );

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

  async function move(recordIds: string[], groupId: string) {
    setError(null);
    try {
      await onMove(recordIds, groupId === UNASSIGNED_GROUP ? null : groupId);
      // Only what moved: a student picked in another card is still picked there.
      setPicked((current) => current.filter((id) => !recordIds.includes(id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDrag(null);
    const from = active.data.current?.group as string | undefined;
    // No target, or the card it started in: a cancelled drag changes nothing.
    if (!over || from === undefined || over.id === from) return;

    const source = groups.find((group) => group.id === from);
    if (!source) return;

    void move(
      carriedBy(active, source, filters[source.id], picked).map((student) => student.id),
      String(over.id),
    );
  }

  function startDrag({ active, activatorEvent }: DragStartEvent) {
    const from = active.data.current?.group as string | undefined;
    const source = groups.find((group) => group.id === from);
    if (!source) return;

    const students = carriedBy(active, source, filters[source.id], picked);
    const grabbed = String(active.data.current?.name ?? "");
    // Where everything the card shows is going, the tag that stands for all of them goes too.
    const carrying = new Set(students.map((student) => student.id));
    const takesAll = filterStudentsOf(source, filters[source.id]).every((student) =>
      carrying.has(student.id),
    );

    setDrag({
      ids: new Set([String(active.id), ...carrying]),
      // The grabbed tag leads, and the rest follow in the order the card lists them.
      names: [
        ...(takesAll && grabbed !== ALL_LABEL ? [ALL_LABEL] : []),
        grabbed,
        ...students.filter((student) => student.id !== active.id).map(studentTagName),
      ],
      // A keyboard drag has no pointer for an overlay to follow, and the tags it would copy are
      // still on screen where the teacher left them.
      overlay: !(activatorEvent instanceof KeyboardEvent),
    });
  }

  return (
    <div className="space-y-2">
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={dropTarget}
        onDragStart={startDrag}
        onDragCancel={() => setDrag(null)}
        onDragEnd={handleDragEnd}
      >
        <DraggingCursor />
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <AssignmentCard
              key={group.id}
              group={group}
              programs={programs}
              skillLevels={skillLevels}
              columns={columns}
              registered={registered}
              filterGroups={filterGroups}
              filter={filters[group.id] ?? EMPTY_FILTER}
              onFilterChange={(next) => setFilters((current) => ({ ...current, [group.id]: next }))}
              picked={picked}
              carried={carried}
              onToggle={togglePicked}
              onToggleAll={toggleAll}
            />
          ))}
        </div>

        {/* Mounted only while a pointer is carrying something: an overlay measures itself, and
            one standing by with nothing in it would answer for where the drag is. */}
        {drag?.overlay ? (
          <DragOverlay dropAnimation={null}>
            <ul className="flex w-max max-w-xs flex-wrap gap-1.5 opacity-80">
              {drag.names.map((name) => (
                <li key={name}>
                  <DraggedTag name={name} />
                </li>
              ))}
            </ul>
          </DragOverlay>
        ) : null}
      </DndContext>
    </div>
  );
}

function filterStudentsOf(group: AssignmentGroup, filter: StudentFilter | undefined) {
  return filterStudents(group.students, filter ?? EMPTY_FILTER);
}

/**
 * Who a drag started on this tag is carrying. "Alle" stands for everyone the card's filter
 * leaves; a student who is part of that card's selection takes it along, filtered out of sight
 * or not; one who is not travels alone. Asked once, so what the overlay shows is what moves.
 */
function carriedBy(
  active: DragEndEvent["active"],
  source: AssignmentGroup,
  filter: StudentFilter | undefined,
  picked: readonly string[],
): RosterStudent[] {
  if (active.data.current?.all === true) return filterStudentsOf(source, filter);

  const recordId = String(active.id);
  const selection = source.students.filter((student) => picked.includes(student.id));

  return selection.some((student) => student.id === recordId)
    ? selection
    : source.students.filter((student) => student.id === recordId);
}
