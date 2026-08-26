/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { classOverview, skillColumns } from "@/lib/assignment/statistics";
import type { RosterStudent } from "@/lib/students/roster";
import { ClassOverviewTable } from "./class-overview-table";

const PROGRAMS = [{ name: "Ski" }, { name: "Snowboard" }];
const SKILL_LEVELS = [{ name: "Anfänger" }, { name: "Profi" }];
const CLASSES = [{ name: "5AHIF" }, { name: "5BHIF" }];
const COLUMNS = skillColumns(PROGRAMS, SKILL_LEVELS);

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
    skillLevel: "Profi",
    isAttending: true,
    eventId: null,
    ...overrides,
  };
}

function setup(students: RosterStudent[]) {
  render(<ClassOverviewTable rows={classOverview(students, CLASSES, COLUMNS)} columns={COLUMNS} />);
}

const cellsOf = (name: string) =>
  within(screen.getByRole("row", { name: new RegExp(`^${name}`) }))
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("ClassOverviewTable", () => {
  it("heads the columns in German, the fixed ones first", () => {
    setup([]);

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);

    expect(headers.slice(0, 6)).toEqual([
      "Klasse",
      "Angemeldet",
      "Nimmt teil",
      "Anteil",
      "Männlich",
      "Weiblich",
    ]);
  });

  it("groups the skill level columns under the program they belong to", () => {
    setup([]);

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);

    expect(headers).toContain("Ski");
    expect(headers).toContain("Snowboard");
    expect(headers.filter((header) => header === "Anfänger")).toHaveLength(2);
  });

  it("shows one row per class, whether anyone registered for it or not", () => {
    setup([student()]);

    expect(screen.getByRole("row", { name: /^5AHIF/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^5BHIF/ })).toBeInTheDocument();
  });

  it("counts a student who is not attending in the total and in the share only", () => {
    setup([student({ gender: "male" }), student({ gender: "male", isAttending: false })]);

    expect(cellsOf("5AHIF").slice(0, 6)).toEqual(["5AHIF", "2", "1", "50 %", "1", "0"]);
  });

  it("shows a class nobody registered for as empty rather than as a division by zero", () => {
    setup([student()]);

    expect(cellsOf("5BHIF").slice(0, 6)).toEqual(["5BHIF", "0", "0", "0 %", "0", "0"]);
  });

  it("counts the skill levels under their program", () => {
    setup([
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Snowboard", skillLevel: "Anfänger" }),
    ]);

    // Ski/Anfänger, Ski/Profi, Snowboard/Anfänger, Snowboard/Profi
    expect(cellsOf("5AHIF").slice(6)).toEqual(["0", "1", "1", "0"]);
  });
});
