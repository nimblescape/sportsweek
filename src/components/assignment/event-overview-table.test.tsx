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
import { EventOverviewTable } from "./event-overview-table";

const COLUMNS = skillColumns([{ name: "Ski" }], [{ name: "Anfänger" }, { name: "Profi" }]);
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
    eventId: null,
    ...overrides,
  };
}

function setup(students: RosterStudent[] = [], selectedId: string | null = null) {
  const onSelect = vi.fn();
  render(
    <EventOverviewTable
      rows={eventOverview(students, EVENTS, COLUMNS)}
      columns={COLUMNS}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const cellsOf = (name: string) =>
  within(row(name))
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("EventOverviewTable", () => {
  it("heads only the attending figures, since every student in it attends", () => {
    setup();

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);

    expect(headers.slice(0, 3)).toEqual(["Event", "Männlich", "Weiblich"]);
    expect(headers).not.toContain("Angemeldet");
    expect(headers).not.toContain("Anteil");
  });

  it("shows one row per event of the season", () => {
    setup();

    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("counts a student under the event they are assigned to and under no other", () => {
    setup([student({ eventId: "event1", gender: "male" })]);

    expect(cellsOf("Montafon").slice(1, 3)).toEqual(["1", "0"]);
    expect(cellsOf("Gardasee").slice(1, 3)).toEqual(["0", "0"]);
  });

  it("counts an unassigned student in no row", () => {
    setup([student({ eventId: null })]);

    expect(cellsOf("Montafon").slice(1, 3)).toEqual(["0", "0"]);
  });

  it("reports the event whose row was clicked", async () => {
    const onSelect = setup();

    await userEvent.click(screen.getByText("Gardasee"));

    expect(onSelect).toHaveBeenCalledWith("event2");
  });

  it("can be selected from the keyboard, so the dialog needs no pointer", async () => {
    const onSelect = setup();

    await userEvent.click(screen.getByRole("radio", { name: "Montafon" }));

    expect(onSelect).toHaveBeenCalledWith("event1");
  });

  it("marks exactly one event as the selected one", () => {
    setup([], "event2");

    expect(screen.getByRole("radio", { name: "Montafon" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Gardasee" })).toBeChecked();
  });

  it("sets the selected row apart from the others", () => {
    setup([], "event2");

    expect(row("Gardasee").className).toContain("bg-accent");
    expect(row("Montafon").className).not.toContain("bg-accent");
  });
});
