/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { RosterStudent } from "@/lib/students/roster";

/** One skill level of one program (US-5, US-7); both tables carry the same set of them. */
export type SkillColumn = { key: string; program: string; skillLevel: string };

export type AttendingCounts = {
  male: number;
  female: number;
  /** Keyed by `SkillColumn.key`, and only where something was counted. */
  skillLevels: Record<string, number>;
};

export type ClassRow = AttendingCounts & {
  class: string;
  /** Registrations of that class, attending or not — the one figure that counts both (US-12). */
  total: number;
  attending: number;
  /** A share between 0 and 1; a class nobody registered for has none rather than a quotient. */
  attendanceRate: number;
};

/** One card of the class overview: the registrations of a class, and the figures describing them. */
export type ClassGroup = ClassRow & { students: RosterStudent[] };

/** The card a student who has no week yet belongs to; it is one of the cards, not a state. */
export const UNASSIGNED_GROUP = "unassigned";
export const UNASSIGNED_GROUP_TITLE = "Nicht zugeteilt";

/** One card of the board: the students it holds, and the figures describing them (US-12). */
export type AssignmentGroup = AttendingCounts & {
  id: string;
  title: string;
  /**
   * The event these students are assigned to, or null on the card of those who have none yet.
   * Stated rather than read back off the id, so an event a teacher happens to name "unassigned"
   * is still an event (US-12, US-21).
   */
  event: string | null;
  students: RosterStudent[];
};

/** A pair of names, kept apart by a separator neither of them can contain. */
export const skillColumnKey = (program: string | null, skillLevel: string | null) =>
  `${program}\u0000${skillLevel}`;

/** Whole per cent: every share here answers "roughly how many", not to a decimal. */
export const asPercent = (share: number) => `${Math.round(share * 100)} %`;

/**
 * The columns of the class table, taken from the maintained lists rather than named here, so a
 * program or a skill level a teacher adds shows up without a code change (US-12).
 */
export function skillColumns(
  programs: readonly { name: string }[],
  skillLevels: readonly string[],
): SkillColumn[] {
  return programs.flatMap((program) =>
    skillLevels.map((skillLevel) => ({
      key: skillColumnKey(program.name, skillLevel),
      program: program.name,
      skillLevel,
    })),
  );
}

/**
 * Everything but the total and the attendance share, which is what the two tables have in
 * common: only a student who is coming can be assigned to an event, so every figure here
 * describes attending students alone (US-12).
 */
export function attendingCounts(
  students: readonly RosterStudent[],
  columns: readonly SkillColumn[],
): AttendingCounts {
  const attending = students.filter((student) => student.isAttending);
  const known = new Set(columns.map((column) => column.key));

  const skillLevels: Record<string, number> = {};
  for (const student of attending) {
    const key = skillColumnKey(student.program, student.skillLevel);
    if (!known.has(key)) continue;
    skillLevels[key] = (skillLevels[key] ?? 0) + 1;
  }

  return {
    male: attending.filter((student) => student.gender === "male").length,
    female: attending.filter((student) => student.gender === "female").length,
    skillLevels,
  };
}

/**
 * What a set of registrations says about itself: how many there are, how many are coming, and
 * everything `attendingCounts` derives. Separate from the row so a card can ask the same of the
 * part its filter leaves and get an answer counted the same way.
 */
export function classFigures(
  registered: readonly RosterStudent[],
  columns: readonly SkillColumn[],
): Omit<ClassRow, "class"> {
  const attending = registered.filter((student) => student.isAttending).length;

  return {
    total: registered.length,
    attending,
    attendanceRate: registered.length === 0 ? 0 : attending / registered.length,
    ...attendingCounts(registered, columns),
  };
}

/**
 * One row per maintained class (US-6), including a class nobody registered for — the rows are
 * the list, not what happens to be stored, so the table reads the same from one day to the next.
 */
export function classOverview(
  students: readonly RosterStudent[],
  classes: readonly string[],
  columns: readonly SkillColumn[],
): ClassGroup[] {
  return classes.map((name) => {
    const registered = students.filter((student) => student.class === name);
    return { class: name, students: registered, ...classFigures(registered, columns) };
  });
}

/**
 * The cards a teacher drags between: the students with no week yet, then one card per week of
 * the event series, in the order the teacher put the weeks in (US-12).
 *
 * A student who answered "no" appears in none of them — only someone who is coming can be
 * assigned — which is why the class cards above are the one place they are counted.
 */
export function assignmentGroups(
  students: readonly RosterStudent[],
  events: readonly string[],
  columns: readonly SkillColumn[],
): AssignmentGroup[] {
  const attending = students.filter((student) => student.isAttending);

  const group = (id: string, title: string, event: string | null): AssignmentGroup => {
    const own = attending.filter((student) => student.event === event);
    return { id, title, event, students: own, ...attendingCounts(own, columns) };
  };

  return [
    group(UNASSIGNED_GROUP, UNASSIGNED_GROUP_TITLE, null),
    ...events.map((event) => group(event, event, event)),
  ];
}
