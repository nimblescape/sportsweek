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
  overrides: Partial<RosterStudent> = {},
): RosterStudent {
  return {
    id: `record-${lastName}`,
    userId: `${lastName}@student.htldornbirn.at`,
    firstName,
    lastName,
    class: "5AHIF",
    gender: "female",
    program: "Ski",
    skillLevel: "Profi",
    isAttending: true,
    eventId: null,
    ...overrides,
  };
}

const ANNA = student("Anna", "Muster");
const BENE = student("Bene", "Berger", { gender: "male", class: "5BHIF" });
const CLARA = student("Clara", "Cerny", { eventId: "event1" });
const DORA = student("Dora", "Danner", { eventId: "event2" });

const onMove = vi.fn();

function setup(roster: RosterStudent[] = [BENE, ANNA, CLARA, DORA]) {
  render(
    <AssignmentBoard
      groups={assignmentGroups(roster, EVENTS, COLUMNS)}
      programs={PROGRAMS}
      skillLevels={SKILL_LEVELS}
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
