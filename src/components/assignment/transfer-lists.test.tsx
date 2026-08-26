/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterGroups } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { TransferLists } from "./transfer-lists";

const GROUPS = filterGroups({
  classes: [{ name: "5AHIF" }, { name: "5BHIF" }],
  programs: [{ name: "Ski" }],
  skillLevels: [{ name: "Profi" }],
});

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

const onAssign = vi.fn();
const onUnassign = vi.fn();

function setup({
  eventName = "Montafon",
  unassigned = [BENE, ANNA],
  assigned = [CLARA],
}: {
  eventName?: string | null;
  unassigned?: RosterStudent[];
  assigned?: RosterStudent[];
} = {}) {
  render(
    <TransferLists
      eventName={eventName}
      unassigned={unassigned}
      assigned={assigned}
      groups={GROUPS}
      onAssign={onAssign}
      onUnassign={onUnassign}
    />,
  );
}

const left = () => within(screen.getByRole("region", { name: "Nicht zugeteilt" }));
const right = () => within(screen.getByRole("region", { name: "Zugeteilt: Montafon" }));
const assignButton = () => screen.getByRole("button", { name: "Auswahl zuteilen" });
const unassignButton = () => screen.getByRole("button", { name: "Zuteilung aufheben" });

beforeEach(() => {
  onAssign.mockReset().mockResolvedValue(undefined);
  onUnassign.mockReset().mockResolvedValue(undefined);
});

describe("TransferLists", () => {
  it("asks for an event first, since the right list is one event's students", () => {
    setup({ eventName: null });

    expect(screen.getByText(/Event/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Nicht zugeteilt" })).not.toBeInTheDocument();
  });

  it("lists the students it was given on each side", () => {
    setup();

    expect(left().getByRole("checkbox", { name: "Berger Bene" })).toBeInTheDocument();
    expect(right().getByRole("checkbox", { name: "Cerny Clara" })).toBeInTheDocument();
  });

  it("counts what is shown below each list", () => {
    setup();

    expect(left().getByText("2 angezeigt")).toBeInTheDocument();
    expect(right().getByText("1 angezeigt")).toBeInTheDocument();
  });

  it("counts what the filter leaves, not what the list holds", async () => {
    setup();

    await userEvent.click(left().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(left().getByText("1 angezeigt")).toBeInTheDocument();
    expect(left().queryByRole("checkbox", { name: "Muster Anna" })).not.toBeInTheDocument();
  });

  it("filters each list on its own", async () => {
    setup();

    await userEvent.click(left().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(right().getByText("1 angezeigt")).toBeInTheDocument();
    expect(right().getByRole("checkbox", { name: "Cerny Clara" })).toBeInTheDocument();
  });

  it("moves the whole selection to the event in one action", async () => {
    setup();

    await userEvent.click(left().getByRole("checkbox", { name: "Berger Bene" }));
    await userEvent.click(left().getByRole("checkbox", { name: "Muster Anna" }));
    await userEvent.click(assignButton());

    expect(onAssign).toHaveBeenCalledWith(["record-Berger", "record-Muster"]);
  });

  it("moves a selection back out of the event", async () => {
    setup();

    await userEvent.click(right().getByRole("checkbox", { name: "Cerny Clara" }));
    await userEvent.click(unassignButton());

    expect(onUnassign).toHaveBeenCalledWith(["record-Cerny"]);
  });

  it("forgets the selection once it has been moved", async () => {
    setup();

    await userEvent.click(left().getByRole("checkbox", { name: "Berger Bene" }));
    await userEvent.click(assignButton());

    await waitFor(() =>
      expect(left().getByRole("checkbox", { name: "Berger Bene" })).not.toBeChecked(),
    );
    expect(assignButton()).toBeDisabled();
  });

  it("has nothing to move while nothing is selected", () => {
    setup();

    expect(assignButton()).toBeDisabled();
    expect(unassignButton()).toBeDisabled();
  });

  it("moves only what is selected on the side the button points away from", async () => {
    setup();

    await userEvent.click(right().getByRole("checkbox", { name: "Cerny Clara" }));

    expect(assignButton()).toBeDisabled();
    expect(unassignButton()).toBeEnabled();
  });

  it("keeps a rejected move on screen and says why", async () => {
    onAssign.mockRejectedValue(
      new Error("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    );
    setup();

    await userEvent.click(left().getByRole("checkbox", { name: "Berger Bene" }));
    await userEvent.click(assignButton());

    expect(
      await screen.findByText("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    ).toBeInTheDocument();
  });

  it("drops a student from the selection once they are no longer in the list", async () => {
    const { rerender } = render(
      <TransferLists
        eventName="Montafon"
        unassigned={[BENE]}
        assigned={[]}
        groups={GROUPS}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Berger Bene" }));
    rerender(
      <TransferLists
        eventName="Montafon"
        unassigned={[]}
        assigned={[{ ...BENE, eventId: "event1" }]}
        groups={GROUPS}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />,
    );

    expect(assignButton()).toBeDisabled();
  });
});
