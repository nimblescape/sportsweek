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
import {
  attendingCounts,
  type AssignmentGroup,
  type SkillColumn,
} from "@/lib/assignment/statistics";
import { filterStudents, type FilterGroup, type StudentFilter } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { cn } from "@/lib/utils";
import { AREA, AREAS, AreaTitle, FilteredTag } from "./card-areas";
import { GenderTable } from "./gender-table";
import { SkillMatrix } from "./skill-matrix";

/** Picks everyone the filter leaves; not a student, so it is dragged under an id of its own. */
const ALL_LABEL = "Alle";
const ALL_NAME = "Alle auswählen";
export const allDragId = (groupId: string) => `all:${groupId}`;

/** How a student's tag reads, so a copy of it cannot come to read differently. */
export const studentTagName = (student: Pick<RosterStudent, "firstName" | "lastName">) =>
  `${student.lastName} ${student.firstName}`;

type AssignmentCardProps = {
  group: AssignmentGroup;
  programs: readonly string[];
  skillLevels: readonly string[];
  /** The columns the group was counted with, so the filtered figures line up with it. */
  columns: readonly SkillColumn[];
  /** Everyone registered for the season, taking part or not — what "Teilnahme" is measured against. */
  registered: readonly RosterStudent[];
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
 * The filter narrows what the card lists; whether the figures follow it is the teacher's own
 * choice, per card, and off to begin with.
 */
export function AssignmentCard({
  group,
  programs,
  skillLevels,
  columns,
  registered,
  filterGroups,
  filter,
  onFilterChange,
  picked,
  onToggle,
  onToggleAll,
}: AssignmentCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [countFiltered, setCountFiltered] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  const shown = filterStudents(group.students, filter);
  const allPicked = shown.every((student) => picked.includes(student.id));
  const pickedShown = shown.filter((student) => picked.includes(student.id)).length;
  const counts = countFiltered ? attendingCounts(shown, columns) : group;
  // Always the season's whole roster rather than the board, which holds no one who stays at
  // home; the filter narrows it alongside the numerator so both answer the same question.
  const measuredAgainst = countFiltered ? filterStudents(registered, filter) : registered;

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
          <div className={AREAS}>
            <section className={AREA}>
              <AreaTitle>Filter</AreaTitle>
              <FilterTagList
                label={group.title}
                groups={filterGroups}
                value={filter}
                onChange={onFilterChange}
              />
            </section>

            <section className={AREA}>
              <AreaTitle
                aside={
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {pickedShown} von {shown.length} ausgewählt
                  </span>
                }
              >
                Schüler:innen
              </AreaTitle>
              {/* A wrapping row rather than one name per line: a card holds a class or two, and
                  down a column that is a great deal of scrolling for very little text.

                  `flex-1` starts it from nothing, so the names never decide how tall the card
                  is — it takes the height the other two areas set, and scrolls inside it. */}
              <ul className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto">
                {shown.length > 1 && (
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
                    name={studentTagName(student)}
                    picked={picked.includes(student.id)}
                    onToggle={() => onToggle(student.id)}
                  />
                ))}
              </ul>
            </section>

            <section className={AREA}>
              <AreaTitle
                aside={
                  <FilteredTag
                    card={group.title}
                    pressed={countFiltered}
                    onPress={() => setCountFiltered(!countFiltered)}
                  />
                }
              >
                Statistik
              </AreaTitle>
              <div className="flex flex-col gap-3">
                <GenderTable counts={counts} registeredTotal={measuredAgainst.length} />
                <SkillMatrix
                  counts={counts.skillLevels}
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

// Shared with the overlay that follows the pointer, so what is dragged looks like what was picked.
const TAG_BOX = "border-border bg-background flex items-center rounded-md border";
const TAG_PICKED = "border-ring bg-accent";
const TAG_GRIP = "text-muted-foreground shrink-0 py-1 pl-1";
const TAG_TEXT = "py-1 pr-2 pl-0.5 text-left text-sm whitespace-nowrap";

/** What is drawn under the pointer during a drag — above every card, so no card's box clips it. */
export function DraggedTag({ name }: { name: string }) {
  return (
    <div className={cn(TAG_BOX, TAG_PICKED, "shadow-lg")}>
      <span className={TAG_GRIP}>
        <GripVertical aria-hidden className="size-3.5" />
      </span>
      <span className={TAG_TEXT}>{name}</span>
    </div>
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    // The overlay is drawn from this, so it can name the tag without looking the student up again.
    data: { ...data, name },
  });

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
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <div className={cn(TAG_BOX, picked && TAG_PICKED)}>
        <button
          type="button"
          aria-label={`${label ?? name} verschieben`}
          className={cn(
            TAG_GRIP,
            "hover:text-foreground focus-visible:ring-ring/50 cursor-grab touch-none rounded-l-md transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing",
          )}
          {...attributes}
          onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined}
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>

        {/* Picked is shown by colouring the tag, so there is no box to tick (US-12). */}
        <button
          type="button"
          aria-label={label}
          aria-pressed={picked}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          className={cn(
            TAG_TEXT,
            "focus-visible:ring-ring/50 touch-none rounded-r-md outline-none focus-visible:ring-3",
          )}
        >
          {name}
        </button>
      </div>
    </li>
  );
}
