/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { classOverview, skillColumns } from "@/lib/assignment/statistics";
import type { RosterStudent } from "@/lib/students/roster";
import { ClassCards } from "./class-cards";

const PROGRAMS = ["Ski", "Snowboard"];
const SKILL_LEVELS = ["Anfänger", "Profi"];
const CLASSES = ["5AHIF", "5BHIF"];
const COLUMNS = skillColumns(
  PROGRAMS.map((name) => ({ name })),
  SKILL_LEVELS.map((name) => ({ name })),
);

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

function setup(students: RosterStudent[] = []) {
  render(
    <ClassCards
      rows={classOverview(
        students,
        CLASSES.map((name) => ({ name })),
        COLUMNS,
      )}
      programs={PROGRAMS}
      skillLevels={SKILL_LEVELS}
    />,
  );
}

const card = (name: string) => screen.getByRole("group", { name });

describe("ClassCards", () => {
  it("stacks one card per class, in the order the teacher put them in", () => {
    setup();

    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual(
      CLASSES,
    );
  });

  it("counts a student who is not attending in the total and the share only", () => {
    setup([student({ gender: "male" }), student({ gender: "male", isAttending: false })]);

    expect(
      within(card("5AHIF")).getByText(
        "Angemeldet: 2 · Nimmt teil: 1 · Anteil: 50 % · Männlich: 1 · Weiblich: 0",
      ),
    ).toBeInTheDocument();
  });

  it("shows a class nobody registered for as empty rather than as a division by zero", () => {
    setup([student()]);

    expect(
      within(card("5BHIF")).getByText(
        "Angemeldet: 0 · Nimmt teil: 0 · Anteil: 0 % · Männlich: 0 · Weiblich: 0",
      ),
    ).toBeInTheDocument();
  });

  it("lays the matrix out with the programs across and the skill levels down", () => {
    setup();

    const inside = within(card("5AHIF"));
    expect(inside.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "",
      "Ski",
      "Snowboard",
    ]);
    expect(inside.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(SKILL_LEVELS);
  });

  it("holds the count of each program and skill level where they cross", () => {
    setup([
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Snowboard", skillLevel: "Anfänger" }),
    ]);

    const cells = within(card("5AHIF"))
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      );

    expect(cells).toEqual([
      ["0", "1"],
      ["2", "0"],
    ]);
  });

  it("folds a card down to its title, and each one on its own", async () => {
    setup();

    await userEvent.click(within(card("5AHIF")).getByRole("button", { name: "Details zu 5AHIF" }));

    expect(within(card("5AHIF")).getByText("5AHIF")).toBeInTheDocument();
    expect(within(card("5AHIF")).queryByRole("table")).not.toBeInTheDocument();
    expect(within(card("5BHIF")).getByRole("table")).toBeInTheDocument();
  });

  /** A class is nothing to pick: the transfer lists below follow the week, not the class. */
  it("offers no way to select a class", () => {
    setup();

    expect(screen.queryByRole("button", { name: "5AHIF" })).not.toBeInTheDocument();
    expect(card("5AHIF").className).not.toContain("bg-accent");
  });
});
