/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { RosterStudent } from "@/lib/students/roster";

/** One skill level of one program (US-5, US-7); both tables carry the same set of them. */
export type SkillColumn = { key: string; program: string; skillLevel: string };

type AttendingCounts = {
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

export type EventRow = AttendingCounts & {
  id: string;
  name: string;
  /** Students assigned to this event. The gender and skill figures only count the answers that
   * were given, so without this an assignment could land without moving a single number. */
  assigned: number;
};

/** A pair of names, kept apart by a separator neither of them can contain. */
export const skillColumnKey = (program: string | null, skillLevel: string | null) =>
  `${program}\u0000${skillLevel}`;

/**
 * The columns of the class table, taken from the maintained lists rather than named here, so a
 * program or a skill level a teacher adds shows up without a code change (US-12).
 */
export function skillColumns(
  programs: readonly { name: string }[],
  skillLevels: readonly { name: string }[],
): SkillColumn[] {
  return programs.flatMap((program) =>
    skillLevels.map((skillLevel) => ({
      key: skillColumnKey(program.name, skillLevel.name),
      program: program.name,
      skillLevel: skillLevel.name,
    })),
  );
}

/**
 * Everything but the total and the attendance share, which is what the two tables have in
 * common: only a student who is coming can be assigned to an event, so every figure here
 * describes attending students alone (US-12).
 */
function countAttending(
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
 * One row per maintained class (US-6), including a class nobody registered for — the rows are
 * the list, not what happens to be stored, so the table reads the same from one day to the next.
 */
export function classOverview(
  students: readonly RosterStudent[],
  classes: readonly { name: string }[],
  columns: readonly SkillColumn[],
): ClassRow[] {
  return classes.map(({ name }) => {
    const registered = students.filter((student) => student.class === name);
    const attending = registered.filter((student) => student.isAttending).length;

    return {
      class: name,
      total: registered.length,
      attending,
      attendanceRate: registered.length === 0 ? 0 : attending / registered.length,
      ...countAttending(registered, columns),
    };
  });
}

/** One row per event of the season, counting the students assigned to it and nobody else (US-12). */
export function eventOverview(
  students: readonly RosterStudent[],
  events: readonly { id: string; name: string }[],
  columns: readonly SkillColumn[],
): EventRow[] {
  return events.map(({ id, name }) => {
    const assigned = students.filter((student) => student.eventId === id && student.isAttending);

    return { id, name, assigned: assigned.length, ...countAttending(assigned, columns) };
  });
}
