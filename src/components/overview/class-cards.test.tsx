/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      invitations={null}
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

/**
 * An empty list is a question the student was never asked (US-21). The dimension that is left
 * keeps its figures on an "Anzahl" line; only a series with neither list shows no matrix at all.
 */
describe("ClassCards — a dimension with no list", () => {
  function setupWith(programs: string[], skillLevels: string[]) {
    const columns = skillColumns(
      programs.map((name) => ({ name })),
      skillLevels,
    );
    render(
      <ClassCards
        rows={classOverview([], CLASSES, columns)}
        programs={programs}
        skillLevels={skillLevels}
        columns={columns}
        filterGroups={FILTERS}
        invitations={null}
      />,
    );
  }

  it("counts the programs on one line when the series has no skill levels", () => {
    setupWith(PROGRAMS, []);

    expect(
      within(matrix("5AHIF"))
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Anzahl"]);
  });

  it("counts the skill levels on one line when the series has no programs", () => {
    setupWith([], SKILL_LEVELS);

    expect(
      within(matrix("5AHIF"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["", "Anzahl"]);
  });

  /** With neither list there is nothing left to name, so the figures the student owns stand alone. */
  it("leaves the matrix out entirely when the series has neither list", () => {
    setupWith([], []);

    expect(card("5AHIF").getAllByRole("table")).toHaveLength(1);
  });

  it("still shows the matrix where both lists have entries", () => {
    setupWith(PROGRAMS, SKILL_LEVELS);

    expect(card("5AHIF").getAllByRole("table")).toHaveLength(2);
  });
});

/**
 * Each class card hands out that class's link (US-23, US-29): a teacher setting registration up
 * reads down the same list of classes they are about to invite.
 */
describe("ClassCards — the invitation controls", () => {
  const writeText = vi.fn();
  const invitations = {
    tokenFor: vi.fn(() => "tok" as string | null),
    linkFor: vi.fn(async () => "tok"),
    regenerate: vi.fn(async () => "fresh"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    invitations.tokenFor.mockReturnValue("tok");
    invitations.linkFor.mockResolvedValue("tok");
    invitations.regenerate.mockResolvedValue("fresh");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  function setupWith(controls: unknown = invitations) {
    render(
      <ClassCards
        rows={classOverview([], CLASSES, COLUMNS)}
        programs={PROGRAMS}
        skillLevels={SKILL_LEVELS}
        columns={COLUMNS}
        filterGroups={FILTERS}
        invitations={controls as never}
      />,
    );
  }

  it("copies that class's link, and only that class's", async () => {
    setupWith();

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Link für 5AHIF kopieren" }));

    expect(invitations.linkFor).toHaveBeenCalledWith("5AHIF");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok`);
  });

  /** Generating the first link opens the series, so the control is offered before one exists. */
  it("offers the copy control to a class that has no link yet", () => {
    invitations.tokenFor.mockReturnValue(null);
    setupWith();

    expect(
      card("5AHIF").getByRole("button", { name: "Link für 5AHIF kopieren" }),
    ).toBeInTheDocument();
  });

  it("regenerates that class's link, which invalidates only its own", async () => {
    setupWith();

    await userEvent.click(
      card("5AHIF").getByRole("button", { name: "Link für 5AHIF neu erstellen" }),
    );

    expect(invitations.regenerate).toHaveBeenCalledWith("5AHIF");
    expect(invitations.regenerate).not.toHaveBeenCalledWith("5BHIF");
  });

  /** Regenerating a link nobody was given evicts nobody, but it is still not worth offering. */
  it("offers no regenerate control to a class that has no link yet", () => {
    invitations.tokenFor.mockReturnValue(null);
    setupWith();

    expect(
      card("5AHIF").queryByRole("button", { name: "Link für 5AHIF neu erstellen" }),
    ).not.toBeInTheDocument();
  });

  it("says what the server said when a link cannot be handed out", async () => {
    invitations.linkFor.mockRejectedValue(new Error("nope"));
    setupWith();

    await userEvent.click(card("5AHIF").getByRole("button", { name: "Link für 5AHIF kopieren" }));

    expect(await card("5AHIF").findByRole("alert")).toBeInTheDocument();
  });

  /** A series that can never be opened has no link to hand out either (US-19, US-22). */
  it("offers no invitation controls at all where the series cannot be opened", () => {
    setupWith(null);

    expect(card("5AHIF").queryByRole("button", { name: /Link f/ })).not.toBeInTheDocument();
  });
});
