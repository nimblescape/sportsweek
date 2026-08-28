/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { assignmentGroups, classOverview, skillColumns, UNASSIGNED_GROUP } from "./statistics";

let seed = 0;

function student(overrides: Partial<Omit<RosterStudent, "record">> = {}): RosterStudent {
  seed += 1;
  return rosterStudent({
    id: `record${seed}`,
    userId: `student${seed}@student.htldornbirn.at`,
    firstName: `Vorname${seed}`,
    lastName: `Nachname${seed}`,
    skillLevel: "Fortgeschritten",
    ...overrides,
  });
}

const PROGRAMS = [{ name: "Ski" }, { name: "Snowboard" }];
const SKILL_LEVELS = ["Keine Vorkenntnisse", "Fortgeschritten"];
const CLASSES = ["5AHIF", "5BHIF"];
const COLUMNS = skillColumns(PROGRAMS, SKILL_LEVELS);

const columnKey = (program: string, skillLevel: string) =>
  COLUMNS.find((column) => column.program === program && column.skillLevel === skillLevel)!.key;

describe("skillColumns", () => {
  it("crosses the maintained programs with the maintained skill levels, in their order", () => {
    expect(COLUMNS.map((column) => [column.program, column.skillLevel])).toEqual([
      ["Ski", "Keine Vorkenntnisse"],
      ["Ski", "Fortgeschritten"],
      ["Snowboard", "Keine Vorkenntnisse"],
      ["Snowboard", "Fortgeschritten"],
    ]);
  });

  it("gives every column a key of its own", () => {
    expect(new Set(COLUMNS.map((column) => column.key)).size).toBe(COLUMNS.length);
  });
});

describe("classOverview", () => {
  it("keeps one row per maintained class, in the order the teacher put them in", () => {
    expect(classOverview([], CLASSES, COLUMNS).map((row) => row.class)).toEqual(["5AHIF", "5BHIF"]);
  });

  it("counts every registration in the total, whether the student attends or not", () => {
    const roster = [student(), student({ isAttending: false })];

    expect(classOverview(roster, CLASSES, COLUMNS)[0]).toMatchObject({ total: 2, attending: 1 });
  });

  it("states attendance as a share of the registrations of that class", () => {
    const roster = [student(), student(), student({ isAttending: false }), student()];

    expect(classOverview(roster, CLASSES, COLUMNS)[0].attendanceRate).toBe(0.75);
  });

  it("answers a class nobody registered for with zero, not with a division by zero", () => {
    const [, empty] = classOverview([student()], CLASSES, COLUMNS);

    expect(empty).toMatchObject({ total: 0, attending: 0, attendanceRate: 0 });
  });

  it("leaves a student who is not attending out of every other figure", () => {
    const roster = [student({ isAttending: false, gender: "male" })];

    expect(classOverview(roster, CLASSES, COLUMNS)[0]).toMatchObject({
      total: 1,
      attending: 0,
      attendanceRate: 0,
      male: 0,
      female: 0,
    });
    expect(classOverview(roster, CLASSES, COLUMNS)[0].skillLevels).toEqual({});
  });

  it("counts the genders of the attending students only", () => {
    const roster = [
      student({ gender: "male" }),
      student({ gender: "female" }),
      student({ gender: "female", isAttending: false }),
    ];

    expect(classOverview(roster, CLASSES, COLUMNS)[0]).toMatchObject({ male: 1, female: 1 });
  });

  it("counts a skill level under the program it was chosen for", () => {
    const roster = [
      student({ program: "Ski", skillLevel: "Fortgeschritten" }),
      student({ program: "Ski", skillLevel: "Fortgeschritten" }),
      student({ program: "Snowboard", skillLevel: "Keine Vorkenntnisse" }),
    ];

    expect(classOverview(roster, CLASSES, COLUMNS)[0].skillLevels).toEqual({
      [columnKey("Ski", "Fortgeschritten")]: 2,
      [columnKey("Snowboard", "Keine Vorkenntnisse")]: 1,
    });
  });

  it("keeps the classes apart", () => {
    const roster = [
      student({ class: "5AHIF" }),
      student({ class: "5BHIF" }),
      student({ class: "5BHIF" }),
    ];

    expect(classOverview(roster, CLASSES, COLUMNS).map((row) => row.total)).toEqual([1, 2]);
  });
});

describe("assignmentGroups", () => {
  const EVENTS = ["Montafon", "Gardasee"];

  const groups = (roster: RosterStudent[]) => assignmentGroups(roster, EVENTS, COLUMNS);

  it("puts the students with no week yet first, then one card per week, in the teacher's order", () => {
    expect(groups([]).map((group) => group.title)).toEqual([
      "Nicht zugeteilt",
      "Montafon",
      "Gardasee",
    ]);
  });

  it("names the unassigned card by an id of its own, so it can be dropped on", () => {
    expect(groups([])[0].id).toBe(UNASSIGNED_GROUP);
    expect(
      groups([])
        .slice(1)
        .map((group) => group.id),
    ).toEqual(EVENTS);
  });

  it("holds each student in exactly one card", () => {
    const roster = [student({ event: null }), student({ event: "Gardasee" })];

    expect(groups(roster).map((group) => group.students.length)).toEqual([1, 0, 1]);
  });

  /**
   * The gender and skill figures only count answers that were given, so a half-filled
   * registration could otherwise be moved without changing a single number.
   */
  it("holds a student whose answers are still missing", () => {
    const roster = [student({ event: "Montafon", gender: null, program: null, skillLevel: null })];

    expect(groups(roster)[1].students).toHaveLength(1);
    expect(groups(roster)[1]).toMatchObject({ male: 0, female: 0 });
  });

  /** They cannot be assigned at all (US-11), so a stale assignment must not put them anywhere. */
  it("leaves a student who is not attending out of every card", () => {
    const roster = [
      student({ event: "Montafon", isAttending: false }),
      student({ event: null, isAttending: false }),
    ];

    expect(groups(roster).map((group) => group.students.length)).toEqual([0, 0, 0]);
  });

  /** The card is the name, so an event another series happens to spell the same way is its own. */
  it("holds only the students naming an event this list offers", () => {
    const roster = [student({ event: "Montafon" }), student({ event: "Sommerwoche" })];

    expect(groups(roster).map((group) => group.students.length)).toEqual([0, 1, 0]);
  });

  it("counts the genders of the students it holds", () => {
    const roster = [
      student({ event: "Montafon", gender: "male" }),
      student({ event: "Montafon", gender: "female" }),
      student({ event: "Gardasee", gender: "female" }),
    ];

    expect(groups(roster)[1]).toMatchObject({ male: 1, female: 1 });
    expect(groups(roster)[2]).toMatchObject({ male: 0, female: 1 });
  });

  it("counts skill levels per program, as the class cards do", () => {
    const roster = [
      student({ event: "Montafon", program: "Ski", skillLevel: "Keine Vorkenntnisse" }),
      student({ event: "Montafon", program: "Ski", skillLevel: "Keine Vorkenntnisse" }),
    ];

    expect(groups(roster)[1].skillLevels).toEqual({
      [columnKey("Ski", "Keine Vorkenntnisse")]: 2,
    });
  });
});
