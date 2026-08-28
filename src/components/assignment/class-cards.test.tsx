/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { classOverview, skillColumns } from "@/lib/assignment/statistics";
import { filterGroups } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { ClassCards } from "./class-cards";

const PROGRAMS = ["Ski", "Snowboard"];
const SKILL_LEVELS = ["Anfänger", "Profi"];
const CLASSES = ["5AHIF", "5BHIF"];
const COLUMNS = skillColumns(
  PROGRAMS.map((name) => ({ name })),
  SKILL_LEVELS,
);
const FILTERS = filterGroups({
  classes: CLASSES,
  programs: PROGRAMS.map((name) => ({ name })),
  skillLevels: SKILL_LEVELS,
});

let seed = 0;

function student(overrides: Partial<Omit<RosterStudent, "record">> = {}): RosterStudent {
  seed += 1;
  return rosterStudent({
    id: `record${seed}`,
    studentUpn: `student${seed}@student.htldornbirn.at`,
    firstName: `Vorname${seed}`,
    lastName: `Nachname${seed}`,
    ...overrides,
  });
}

const nameOf = (person: RosterStudent) => `${person.lastName} ${person.firstName}`;

function setup(students: RosterStudent[] = []) {
  render(
    <ClassCards
      rows={classOverview(students, CLASSES, COLUMNS)}
      programs={PROGRAMS}
      skillLevels={SKILL_LEVELS}
      columns={COLUMNS}
      filterGroups={FILTERS}
    />,
  );
}

const card = (name: string) => within(screen.getByRole("group", { name }));
const listIn = (className: string, label: string) =>
  within(card(className).getByRole("list", { name: `${className}: ${label}` }));
const figures = (className: string) => card(className).getAllByRole("table")[0];
const matrix = (className: string) => card(className).getAllByRole("table")[1];
const cellsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("ClassCards", () => {
  it("stacks one card per class, in the order the teacher put them in", () => {
    setup();

    const labels = screen
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label") ?? "")
      .filter((label) => !label.endsWith("Filter"));

    expect(labels).toEqual(CLASSES);
  });

  it("divides a card into its three areas, each headed and on a surface of its own", () => {
    setup();

    const areas = card("5AHIF").getAllByRole("heading", { level: 3 });

    expect(areas.map((heading) => heading.textContent)).toEqual([
      "Filter",
      "Schüler:innen",
      "Statistik",
    ]);
    for (const heading of areas) {
      expect(heading.closest("section")?.className).toContain("border");
    }
  });
});

describe("ClassCards — the students", () => {
  it("holds those taking part above those who are not", () => {
    setup();

    expect(
      card("5AHIF")
        .getAllByRole("list")
        .map((list) => list.getAttribute("aria-label")),
    ).toEqual(["5AHIF: Teilnahme", "5AHIF: Keine Teilnahme"]);
  });

  it("puts each student into the cloud their answer belongs in", () => {
    const coming = student();
    const staying = student({ isAttending: false });
    setup([coming, staying]);

    expect(listIn("5AHIF", "Teilnahme").getByText(nameOf(coming))).toBeInTheDocument();
    expect(listIn("5AHIF", "Keine Teilnahme").getByText(nameOf(staying))).toBeInTheDocument();
  });

  it("lists only the students of its own class", () => {
    const here = student({ class: "5AHIF" });
    const elsewhere = student({ class: "5BHIF" });
    setup([here, elsewhere]);

    expect(listIn("5AHIF", "Teilnahme").queryByText(nameOf(elsewhere))).not.toBeInTheDocument();
    expect(listIn("5BHIF", "Teilnahme").getByText(nameOf(elsewhere))).toBeInTheDocument();
  });

  it("narrows the list to what the card's own filter leaves", async () => {
    const skier = student({ program: "Ski" });
    const boarder = student({ program: "Snowboard" });
    setup([skier, boarder]);

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Programm: Ski" }));

    expect(listIn("5AHIF", "Teilnahme").getByText(nameOf(skier))).toBeInTheDocument();
    expect(listIn("5AHIF", "Teilnahme").queryByText(nameOf(boarder))).not.toBeInTheDocument();
  });
});

describe("ClassCards — the figures", () => {
  it("heads the genders taking part, their sum and the share", () => {
    setup([student({ gender: "male" }), student({ gender: "male", isAttending: false })]);

    expect(
      within(figures("5AHIF"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Männlich", "Weiblich", "Gesamt", "Teilnahme"]);
    expect(cellsOf(figures("5AHIF"))).toEqual(["1", "0", "1", "50 %"]);
  });

  it("answers a class nobody registered for with zero, not with a division by zero", () => {
    setup([student({ class: "5AHIF" })]);

    expect(cellsOf(figures("5BHIF"))).toEqual(["0", "0", "0", "0 %"]);
  });

  it("describes the whole class while the toggle is off, however the filter narrows the list", async () => {
    setup([student({ program: "Ski" }), student({ program: "Snowboard" })]);

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Programm: Ski" }));

    expect(cellsOf(figures("5AHIF"))).toEqual(["0", "2", "2", "100 %"]);
  });

  it("counts only what the filter leaves once the toggle is on", async () => {
    setup([student({ program: "Ski" }), student({ program: "Snowboard" })]);

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Programm: Ski" }));
    await userEvent.click(card("5AHIF").getByRole("button", { name: "5AHIF: Gefiltert" }));

    expect(cellsOf(figures("5AHIF"))).toEqual(["0", "1", "1", "100 %"]);
  });

  it("lays the matrix out with the programs across and the skill levels down", () => {
    setup();

    expect(
      within(matrix("5AHIF"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["", "Ski", "Snowboard"]);
    expect(
      within(matrix("5AHIF"))
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(SKILL_LEVELS);
  });

  it("holds the count of each program and skill level where they cross", () => {
    setup([
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Snowboard", skillLevel: "Anfänger" }),
    ]);

    const cells = within(matrix("5AHIF"))
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
});

describe("ClassCards — folding", () => {
  it("folds a card down to its title, and each one on its own", async () => {
    setup();

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Details zu 5AHIF" }));

    expect(card("5AHIF").getByText("5AHIF: 0")).toBeInTheDocument();
    expect(card("5AHIF").queryByRole("table")).not.toBeInTheDocument();
    expect(card("5BHIF").getAllByRole("table").length).toBeGreaterThan(0);
  });

  /** A class is nothing to pick: the cards below follow the week, not the class. */
  it("offers no way to select a class", () => {
    setup();

    expect(screen.queryByRole("button", { name: "5AHIF" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "5AHIF" }).className).not.toContain("bg-accent");
  });
});
