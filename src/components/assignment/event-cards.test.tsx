/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { eventOverview, skillColumns } from "@/lib/assignment/statistics";
import type { RosterStudent } from "@/lib/students/roster";
import { EventCards } from "./event-cards";

const PROGRAMS = ["Ski", "Snowboard"];
const SKILL_LEVELS = ["Anfänger", "Profi"];
const COLUMNS = skillColumns(
  PROGRAMS.map((name) => ({ name })),
  SKILL_LEVELS.map((name) => ({ name })),
);
const EVENTS = [
  { id: "event1", name: "Montafon" },
  { id: "event2", name: "Gardasee" },
];

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
    eventId: "event1",
    ...overrides,
  };
}

function setup(students: RosterStudent[] = [], selectedId: string | null = null) {
  const onSelect = vi.fn();
  render(
    <EventCards
      rows={eventOverview(students, EVENTS, COLUMNS)}
      programs={PROGRAMS}
      skillLevels={SKILL_LEVELS}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const card = (name: string) => screen.getByRole("group", { name });

describe("EventCards", () => {
  it("stacks one card per event, in the order the teacher put them in", () => {
    setup();

    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "Montafon",
      "Gardasee",
    ]);
  });

  it("titles each card with its event and how many it holds", () => {
    setup([student(), student()]);

    expect(within(card("Montafon")).getByText("Montafon: 2")).toBeInTheDocument();
    expect(within(card("Gardasee")).getByText("Gardasee: 0")).toBeInTheDocument();
  });

  it("says how many of each gender the event holds, under the title", () => {
    setup([student({ gender: "male" }), student({ gender: "male" }), student()]);

    expect(within(card("Montafon")).getByText("Männlich: 2 · Weiblich: 1")).toBeInTheDocument();
  });

  it("counts only the students assigned to that event", () => {
    setup([student({ eventId: "event2", gender: "male" })]);

    expect(within(card("Montafon")).getByText("Männlich: 0 · Weiblich: 0")).toBeInTheDocument();
    expect(within(card("Gardasee")).getByText("Männlich: 1 · Weiblich: 0")).toBeInTheDocument();
  });

  it("heads the matrix with the programs, in their order", () => {
    setup();

    const headers = within(card("Montafon"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual(["", "Ski", "Snowboard"]);
  });

  it("gives the matrix one row per skill level, in its order", () => {
    setup();

    const rows = within(card("Montafon"))
      .getAllByRole("rowheader")
      .map((header) => header.textContent);

    expect(rows).toEqual(["Anfänger", "Profi"]);
  });

  it("holds the count of each program and skill level where they cross", () => {
    setup([
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Ski", skillLevel: "Profi" }),
      student({ program: "Snowboard", skillLevel: "Anfänger" }),
    ]);

    const cells = within(card("Montafon"))
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      );

    // Anfänger, then Profi — Ski first in both.
    expect(cells).toEqual([
      ["0", "1"],
      ["2", "0"],
    ]);
  });

  it("selects the event when its card is clicked", async () => {
    const onSelect = setup();

    await userEvent.click(screen.getByText("Gardasee: 0"));

    expect(onSelect).toHaveBeenCalledWith("event2");
  });

  it("can be selected from the keyboard, so the dialog needs no pointer", async () => {
    const onSelect = setup();

    screen.getByRole("button", { name: "Montafon" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("event1");
  });

  it("colours the whole selected card and leaves the others alone", () => {
    setup([], "event2");

    expect(card("Gardasee").className).toContain("bg-accent");
    expect(card("Montafon").className).not.toContain("bg-accent");
  });

  it("marks exactly one event as the selected one", () => {
    setup([], "event2");

    expect(screen.getByRole("button", { name: "Gardasee" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Montafon" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

const toggle = (name: string) =>
  within(card(name)).getByRole("button", { name: `Details zu ${name}` });

describe("EventCards — collapsing", () => {
  it("starts expanded, with the arrow pointing down", () => {
    setup();

    expect(toggle("Montafon")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Montafon").querySelector("svg")?.getAttribute("class")).toContain("rotate-90");
  });

  it("folds the card down to its title, arrow pointing right", async () => {
    setup();

    await userEvent.click(toggle("Montafon"));

    expect(toggle("Montafon")).toHaveAttribute("aria-expanded", "false");
    expect(toggle("Montafon").querySelector("svg")?.getAttribute("class")).not.toContain(
      "rotate-90",
    );
    expect(within(card("Montafon")).getByText("Montafon: 0")).toBeInTheDocument();
    expect(within(card("Montafon")).queryByRole("table")).not.toBeInTheDocument();
    expect(within(card("Montafon")).queryByText(/Männlich/)).not.toBeInTheDocument();
  });

  it("folds each card on its own", async () => {
    setup();

    await userEvent.click(toggle("Montafon"));

    expect(within(card("Gardasee")).getByRole("table")).toBeInTheDocument();
  });

  it("leaves the selection where it was, since folding says nothing about which week is worked on", async () => {
    const onSelect = setup([], "event2");

    await userEvent.click(toggle("Montafon"));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
