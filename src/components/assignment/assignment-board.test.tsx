/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignmentGroups, skillColumns } from "@/lib/assignment/statistics";
import { filterGroups } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { stubBoardLayout } from "@/test/stub-board-layout";
import { AssignmentBoard } from "./assignment-board";

const PROGRAMS = ["Ski"];
const SKILL_LEVELS = ["Profi"];
const COLUMNS = skillColumns(
  PROGRAMS.map((name) => ({ name })),
  SKILL_LEVELS.map((name) => ({ name })),
);
const FILTERS = filterGroups({
  classes: [{ name: "5AHIF" }, { name: "5BHIF" }],
  programs: [{ name: "Ski" }],
  skillLevels: [{ name: "Profi" }],
});
const EVENTS = [
  { id: "event1", name: "Montafon" },
  { id: "event2", name: "Gardasee" },
];

function student(
  firstName: string,
  lastName: string,
  overrides: Partial<Omit<RosterStudent, "record">> = {},
): RosterStudent {
  return rosterStudent({
    id: `record-${lastName}`,
    userId: `${lastName}@student.htldornbirn.at`,
    firstName,
    lastName,
    ...overrides,
  });
}

const ANNA = student("Anna", "Muster");
const BENE = student("Bene", "Berger", { gender: "male", class: "5BHIF" });
const CLARA = student("Clara", "Cerny", { eventId: "event1" });
const DORA = student("Dora", "Danner", { eventId: "event2" });
/** Registered but staying at home, so no card holds them and only "Teilnahme" counts them. */
const ELIAS = student("Elias", "Egger", {
  gender: "male",
  class: "5BHIF",
  isAttending: false,
  program: null,
  skillLevel: null,
});

const onMove = vi.fn();

function setup(roster: RosterStudent[] = [BENE, ANNA, CLARA, DORA]) {
  render(
    <AssignmentBoard
      groups={assignmentGroups(roster, EVENTS, COLUMNS)}
      programs={PROGRAMS}
      skillLevels={SKILL_LEVELS}
      columns={COLUMNS}
      registered={roster}
      filterGroups={FILTERS}
      onMove={onMove}
    />,
  );
}

const card = (name: string) => within(screen.getByRole("group", { name }));

async function dragTo(handle: HTMLElement, direction: "{ArrowDown}" | "{ArrowUp}", steps = 1) {
  handle.focus();
  await userEvent.keyboard("{ }");
  for (let step = 0; step < steps; step += 1) await userEvent.keyboard(direction);
  await userEvent.keyboard("{ }");
}

const handleIn = (name: string, row: string) =>
  card(name).getByRole("button", { name: `${row} verschieben` });

beforeEach(() => {
  onMove.mockReset().mockResolvedValue(undefined);
  stubBoardLayout();
});

afterEach(() => vi.restoreAllMocks());

describe("AssignmentBoard", () => {
  it("stacks the students without a week first, then one card per week", () => {
    setup();

    const labels = screen
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label") ?? "")
      .filter((label) => !label.endsWith("Filter"));

    expect(labels).toEqual(["Nicht zugeteilt", "Montafon", "Gardasee"]);
  });

  it("holds each student in the card of the week they belong to", () => {
    setup();

    expect(
      card("Nicht zugeteilt").getByRole("button", { name: "Muster Anna" }),
    ).toBeInTheDocument();
    expect(card("Montafon").getByRole("button", { name: "Cerny Clara" })).toBeInTheDocument();
    expect(card("Gardasee").getByRole("button", { name: "Danner Dora" })).toBeInTheDocument();
  });

  it("counts what the card holds in its title", () => {
    setup();

    expect(card("Nicht zugeteilt").getByText("Nicht zugeteilt: 2")).toBeInTheDocument();
    expect(card("Montafon").getByText("Montafon: 1")).toBeInTheDocument();
  });

  it("divides a card into its three areas, each headed and on a surface of its own", () => {
    setup();

    const areas = card("Montafon").getAllByRole("heading", { level: 3 });

    expect(areas.map((heading) => heading.textContent)).toEqual([
      "Filter",
      "Schüler:innen",
      "Statistik",
    ]);
    for (const heading of areas) {
      expect(heading.closest("section")?.className).toContain("border");
    }
  });

  it("says how many of the students it lists are picked", async () => {
    setup();

    expect(card("Nicht zugeteilt").getByText("0 von 2 ausgewählt")).toBeInTheDocument();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Berger Bene" }));

    expect(card("Nicht zugeteilt").getByText("1 von 2 ausgewählt")).toBeInTheDocument();
  });

  /** The tally follows the filter, though the selection behind it does not. */
  it("counts only the students the filter leaves", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Muster Anna" }));
    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(card("Nicht zugeteilt").getByText("0 von 1 ausgewählt")).toBeInTheDocument();
  });

  it("filters each card on its own, and only what it lists", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(
      card("Nicht zugeteilt").queryByRole("button", { name: "Muster Anna" }),
    ).not.toBeInTheDocument();
    expect(card("Montafon").getByRole("button", { name: "Cerny Clara" })).toBeInTheDocument();
  });

  it("leaves the card's own figures alone when its filter narrows the list", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(card("Nicht zugeteilt").getByText("Nicht zugeteilt: 2")).toBeInTheDocument();
  });

  it("assigns a student dragged onto a week", async () => {
    setup();

    await dragTo(handleIn("Nicht zugeteilt", "Berger Bene"), "{ArrowDown}");

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["record-Berger"], "event1"));
  });

  /** No holding list in between: a student goes straight from one week to the next (US-12). */
  it("moves a student straight from one week to another", async () => {
    setup();

    await dragTo(handleIn("Montafon", "Cerny Clara"), "{ArrowDown}");

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["record-Cerny"], "event2"));
  });

  it("takes the week away from a student dragged back onto the unassigned card", async () => {
    setup();

    await dragTo(handleIn("Montafon", "Cerny Clara"), "{ArrowUp}");

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["record-Cerny"], null));
  });

  it("takes the whole selection of that card along", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Alle auswählen" }));
    await dragTo(handleIn("Nicht zugeteilt", "Berger Bene"), "{ArrowDown}");

    await waitFor(() =>
      expect(onMove).toHaveBeenCalledWith(["record-Berger", "record-Muster"], "event1"),
    );
  });

  it("leaves a student picked in another card where they are", async () => {
    setup();

    await userEvent.click(card("Montafon").getByRole("button", { name: "Cerny Clara" }));
    await dragTo(handleIn("Nicht zugeteilt", "Berger Bene"), "{ArrowDown}");

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["record-Berger"], "event1"));
  });

  it("offers no 'Alle' where a card holds one student, who is already their own everyone", () => {
    setup();

    expect(
      card("Montafon").queryByRole("button", { name: "Alle auswählen" }),
    ).not.toBeInTheDocument();
    expect(
      card("Nicht zugeteilt").getByRole("button", { name: "Alle auswählen" }),
    ).toBeInTheDocument();
  });

  it("moves everyone the filter leaves when 'Alle' is dragged", async () => {
    setup();

    await dragTo(
      card("Nicht zugeteilt").getByRole("button", { name: "Alle auswählen verschieben" }),
      "{ArrowDown}",
    );

    await waitFor(() =>
      expect(onMove).toHaveBeenCalledWith(["record-Berger", "record-Muster"], "event1"),
    );
  });

  it("leaves every card alone when the drag is cancelled", async () => {
    setup();

    await dragTo(handleIn("Nicht zugeteilt", "Berger Bene"), "{ArrowDown}");
    onMove.mockClear();

    handleIn("Nicht zugeteilt", "Muster Anna").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");

    expect(onMove).not.toHaveBeenCalled();
  });

  it("says why a refused move did not happen", async () => {
    onMove.mockRejectedValue(new Error("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."));
    setup();

    await dragTo(handleIn("Nicht zugeteilt", "Berger Bene"), "{ArrowDown}");

    expect(
      await screen.findByText("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    ).toBeInTheDocument();
  });
});

// The figures answer either "what is in this card" or "what is in the part of it I am looking
// at", and which of the two is a question only the teacher at the card can answer.
describe("AssignmentBoard — what the figures count", () => {
  const toggleIn = (name: string) => card(name).getByRole("button", { name: `${name}: Gefiltert` });

  const genderCells = (name: string) =>
    within(card(name).getAllByRole("table")[0])
      .getAllByRole("cell")
      .map((cell) => cell.textContent);

  it("puts the toggle on the title line of the statistics area", () => {
    setup();

    const heading = card("Nicht zugeteilt").getByRole("heading", { name: "Statistik" });

    expect(heading.parentElement).toContainElement(toggleIn("Nicht zugeteilt"));
  });

  it("carries the two genders, their sum and the share of everyone taking part in one table", () => {
    setup();

    const table = card("Nicht zugeteilt").getAllByRole("table")[0];

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Männlich", "Weiblich", "Gesamt", "Teilnahme"]);
    expect(genderCells("Nicht zugeteilt")).toEqual(["1", "1", "2", "50 %"]);
  });

  it("takes the share of the whole board, so the cards' shares add up to everyone", () => {
    setup();

    expect(genderCells("Montafon")).toEqual(["0", "1", "1", "25 %"]);
  });

  it("measures against everyone registered, not only against those taking part", () => {
    setup([BENE, ANNA, CLARA, DORA, ELIAS]);

    expect(genderCells("Nicht zugeteilt")).toEqual(["1", "1", "2", "40 %"]);
  });

  it("counts the whole card while the toggle is off, however the filter narrows the list", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(genderCells("Nicht zugeteilt")).toEqual(["1", "1", "2", "50 %"]);
  });

  it("counts only what the filter leaves once the toggle is on", async () => {
    setup();

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));
    await userEvent.click(toggleIn("Nicht zugeteilt"));

    expect(genderCells("Nicht zugeteilt")).toEqual(["1", "0", "1", "100 %"]);
  });

  // Filtering to a class asks what that class did, so the students of it who stay at home have
  // to be in the denominator; measuring against the whole event series would answer another question.
  it("measures a filtered card against the registered students the same filter leaves", async () => {
    setup([BENE, ANNA, CLARA, DORA, ELIAS]);

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));
    await userEvent.click(toggleIn("Nicht zugeteilt"));

    expect(genderCells("Nicht zugeteilt")).toEqual(["1", "0", "1", "50 %"]);
  });

  it("is answered per card, since each card carries a filter of its own", async () => {
    setup();

    await userEvent.click(toggleIn("Nicht zugeteilt"));

    expect(toggleIn("Montafon")).not.toBeChecked();
  });
});
