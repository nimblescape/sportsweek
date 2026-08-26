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
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
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
import { AssignmentCard } from "./assignment-card";

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
  /** Everyone registered for the season, taking part or not — what "Teilnahme" is measured against. */
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
    const from = active.data.current?.group as string | undefined;
    // No target, or the card it started in: a cancelled drag changes nothing.
    if (!over || from === undefined || over.id === from) return;

    const source = groups.find((group) => group.id === from);
    if (!source) return;

    const target = String(over.id);
    const filtered = filterStudentsOf(source, filters[source.id]);

    // "Alle" stands for every student the filter leaves, which is exactly what it selects.
    if (active.data.current?.all === true) {
      void move(
        filtered.map((student) => student.id),
        target,
      );
      return;
    }

    const recordId = String(active.id);
    // A student who is part of the selection takes it along, filtered out of sight or not; one
    // who is not travels alone.
    const selection = source.students
      .filter((student) => picked.includes(student.id))
      .map((student) => student.id);

    void move(selection.includes(recordId) ? selection : [recordId], target);
  }

  return (
    <div className="space-y-2">
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={dropTarget} onDragEnd={handleDragEnd}>
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
              onToggle={togglePicked}
              onToggleAll={toggleAll}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function filterStudentsOf(group: AssignmentGroup, filter: StudentFilter | undefined) {
  return filterStudents(group.students, filter ?? EMPTY_FILTER);
}
