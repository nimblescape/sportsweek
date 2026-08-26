/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import {
  useRef,
  useState,
  type KeyboardEventHandler,
  type MouseEvent,
  type PointerEvent,
  type PointerEventHandler,
} from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight, GripVertical } from "lucide-react";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { AssignmentGroup } from "@/lib/assignment/statistics";
import { filterStudents, type FilterGroup, type StudentFilter } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { cn } from "@/lib/utils";
import { GenderTable } from "./gender-table";
import { SkillMatrix } from "./skill-matrix";

/** Picks everyone the filter leaves; not a student, so it is dragged under an id of its own. */
const ALL_LABEL = "Alle";
const ALL_NAME = "Alle auswählen";
export const allDragId = (groupId: string) => `all:${groupId}`;

/** A rule between the areas, turning with them when the card stops being three columns wide. */
const DIVIDER = "border-border max-lg:border-t max-lg:pt-4 lg:border-l lg:pl-4";

function AreaTitle({ children }: { children: string }) {
  return (
    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

type AssignmentCardProps = {
  group: AssignmentGroup;
  programs: readonly string[];
  skillLevels: readonly string[];
  filterGroups: readonly FilterGroup[];
  filter: StudentFilter;
  onFilterChange: (next: StudentFilter) => void;
  picked: readonly string[];
  onToggle: (recordId: string) => void;
  onToggleAll: (students: readonly RosterStudent[], allPicked: boolean) => void;
};

/**
 * One card of the assignment board (US-12) — the students with no week yet, or one week's own.
 * All of them are built alike, which is what makes a student draggable from any card to any
 * other rather than out to a holding list and back in.
 *
 * The filter narrows what the card lists; the figures beside it describe the whole card, so
 * narrowing the list never changes what the card says about itself.
 */
export function AssignmentCard({
  group,
  programs,
  skillLevels,
  filterGroups,
  filter,
  onFilterChange,
  picked,
  onToggle,
  onToggleAll,
}: AssignmentCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  const shown = filterStudents(group.students, filter);
  const allPicked = shown.every((student) => picked.includes(student.id));

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      role="group"
      aria-label={group.title}
      className={cn("transition-shadow", isOver && "ring-ring ring-2")}
    >
      <CardContent className="flex flex-col gap-4">
        <CardTitle className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Details zu ${group.title}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md p-0.5 transition-colors outline-none focus-visible:ring-3"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-4 transition-transform", expanded && "rotate-90")}
            />
          </button>
          {`${group.title}: ${group.students.length}`}
        </CardTitle>

        {expanded && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto]">
            <section>
              <AreaTitle>Filter</AreaTitle>
              <FilterTagList
                label={group.title}
                groups={filterGroups}
                value={filter}
                onChange={onFilterChange}
              />
            </section>

            <section className={DIVIDER}>
              <AreaTitle>Schüler</AreaTitle>
              <ul className="max-h-72 overflow-y-auto">
                {shown.length > 0 && (
                  <Row
                    dragId={allDragId(group.id)}
                    data={{ group: group.id, all: true }}
                    name={ALL_LABEL}
                    label={ALL_NAME}
                    picked={allPicked}
                    onToggle={() => onToggleAll(shown, allPicked)}
                  />
                )}
                {shown.map((student) => (
                  <Row
                    key={student.id}
                    dragId={student.id}
                    data={{ group: group.id }}
                    name={`${student.lastName} ${student.firstName}`}
                    picked={picked.includes(student.id)}
                    onToggle={() => onToggle(student.id)}
                  />
                ))}
              </ul>
            </section>

            {/* Deliberately fed the whole card rather than `shown`: the figures describe the
                card, not the filter someone happens to have typed into it. */}
            <section className={DIVIDER}>
              <AreaTitle>Statistik</AreaTitle>
              <div className="flex flex-col gap-3">
                <GenderTable counts={group} />
                <SkillMatrix
                  counts={group.skillLevels}
                  programs={programs}
                  skillLevels={skillLevels}
                />
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  dragId,
  data,
  name,
  label,
  picked,
  onToggle,
}: {
  dragId: string;
  data: { group: string; all?: true };
  name: string;
  label?: string;
  picked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data });

  /**
   * The whole row is what a pointer drags; the handle is what a keyboard drags. Splitting the
   * two keeps the row's own press free to pick the student — a drag only starts once the pointer
   * has moved, and the click that follows one is swallowed by the sensor.
   */
  const startPointerDrag = listeners?.onPointerDown as PointerEventHandler | undefined;

  // Whether the press landed on a row that was already picked, which is the only case releasing
  // has anything left to do.
  const wasPicked = useRef(false);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    wasPicked.current = picked;
    // Picked on the way down rather than on the way up, so a press that turns into a drag is
    // already carrying what it picked.
    if (!picked) onToggle();
    startPointerDrag?.(event);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // A keyboard activation has no press before it, so it toggles on its own.
    if (event.detail === 0 || wasPicked.current) onToggle();
  }

  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-80")}>
      <div className={cn("flex items-center rounded-md", picked && "bg-accent")}>
        <button
          type="button"
          aria-label={`${label ?? name} verschieben`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-1 transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing"
          {...attributes}
          onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>

        {/* Picked is shown by colouring the row, so there is no box to tick (US-12). */}
        <button
          type="button"
          aria-label={label}
          aria-pressed={picked}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          className="focus-visible:ring-ring/50 flex-1 touch-none rounded-md px-1 py-2 text-left text-sm outline-none focus-visible:ring-3"
        >
          {name}
        </button>
      </div>
    </li>
  );
}
