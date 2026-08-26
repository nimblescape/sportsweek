/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { classOverview, eventOverview, skillColumns } from "./statistics";

let seed = 0;

function student(overrides: Partial<RosterStudent> = {}): RosterStudent {
  seed += 1;
  return {
    id: `record${seed}`,
    userId: `student${seed}@student.htldornbirn.at`,
    firstName: `Vorname${seed}`,
    lastName: `Nachname${seed}`,
    class: "5AHIF",
    gender: "female",
    program: "Ski",
    skillLevel: "Fortgeschritten",
    isAttending: true,
    eventId: null,
    ...overrides,
  };
}

const PROGRAMS = [{ name: "Ski" }, { name: "Snowboard" }];
const SKILL_LEVELS = [{ name: "Keine Vorkenntnisse" }, { name: "Fortgeschritten" }];
const CLASSES = [{ name: "5AHIF" }, { name: "5BHIF" }];
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

describe("eventOverview", () => {
  const EVENTS = [
    { id: "event1", name: "Montafon" },
    { id: "event2", name: "Gardasee" },
  ];

  it("keeps one row per event of the season, in the order the teacher put them in", () => {
    expect(eventOverview([], EVENTS, COLUMNS).map((row) => row.name)).toEqual([
      "Montafon",
      "Gardasee",
    ]);
  });

  it("counts a student under the event they are assigned to, and under no other", () => {
    const roster = [
      student({ eventId: "event1", gender: "male" }),
      student({ eventId: "event2", gender: "female" }),
    ];

    expect(eventOverview(roster, EVENTS, COLUMNS).map((row) => [row.male, row.female])).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  /**
   * The gender and skill figures only count answers that were given, so a half-filled
   * registration could otherwise be assigned without moving a single number.
   */
  it("counts the students assigned to the event, answered or not", () => {
    const roster = [
      student({ eventId: "event1", gender: null, program: null, skillLevel: null }),
      student({ eventId: "event1" }),
      student({ eventId: null }),
    ];

    expect(eventOverview(roster, EVENTS, COLUMNS).map((row) => row.assigned)).toEqual([2, 0]);
  });

  it("leaves a student who is not attending out of the count as well", () => {
    const roster = [student({ eventId: "event1", isAttending: false })];

    expect(eventOverview(roster, EVENTS, COLUMNS)[0].assigned).toBe(0);
  });

  it("counts an unassigned student nowhere", () => {
    const rows = eventOverview([student({ eventId: null })], EVENTS, COLUMNS);

    expect(rows.map((row) => row.male + row.female)).toEqual([0, 0]);
  });

  /** They cannot be assigned in the first place (US-11), so a stale assignment must not count. */
  it("counts a student who is not attending nowhere, even if an event is still on their record", () => {
    const rows = eventOverview(
      [student({ eventId: "event1", isAttending: false })],
      EVENTS,
      COLUMNS,
    );

    expect(rows[0]).toMatchObject({ male: 0, female: 0 });
    expect(rows[0].skillLevels).toEqual({});
  });

  it("counts skill levels per program, as the class table does", () => {
    const roster = [
      student({ eventId: "event1", program: "Ski", skillLevel: "Keine Vorkenntnisse" }),
      student({ eventId: "event1", program: "Ski", skillLevel: "Keine Vorkenntnisse" }),
    ];

    expect(eventOverview(roster, EVENTS, COLUMNS)[0].skillLevels).toEqual({
      [columnKey("Ski", "Keine Vorkenntnisse")]: 2,
    });
  });
});
