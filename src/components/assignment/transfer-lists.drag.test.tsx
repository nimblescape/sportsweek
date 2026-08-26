/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterGroups } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { TransferLists } from "./transfer-lists";

const GROUPS = filterGroups({
  classes: [{ name: "5AHIF" }],
  programs: [{ name: "Ski" }],
  skillLevels: [{ name: "Profi" }],
});

function student(firstName: string, lastName: string): RosterStudent {
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
  };
}

const ANNA = student("Anna", "Muster");
const BENE = student("Bene", "Berger");
const CLARA = student("Clara", "Cerny");

const onAssign = vi.fn();
const onUnassign = vi.fn();

/**
 * Lays the two lists out side by side for the duration of a test: jsdom reports a zero rect for
 * everything, which leaves drag-and-drop unable to tell one list from the other.
 */
function stubListLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const label = this.closest("section")?.getAttribute("aria-label") ?? "";
    const left = label.startsWith("Zugeteilt") ? 300 : 0;
    return {
      x: left,
      y: 0,
      left,
      right: left + 200,
      top: 0,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

function setup(unassigned: RosterStudent[] = [BENE, ANNA], assigned: RosterStudent[] = [CLARA]) {
  render(
    <TransferLists
      eventName="Montafon"
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
const handleOf = (name: string) => screen.getByRole("button", { name: `${name} verschieben` });

async function drag(name: string, direction: "{ArrowRight}" | "{ArrowLeft}", drop = "{ }") {
  handleOf(name).focus();
  await userEvent.keyboard("{ }");
  await userEvent.keyboard(direction);
  await userEvent.keyboard(drop);
}

beforeEach(() => {
  onAssign.mockReset().mockResolvedValue(undefined);
  onUnassign.mockReset().mockResolvedValue(undefined);
  stubListLayout();
});

afterEach(() => vi.restoreAllMocks());

describe("TransferLists — drag and drop", () => {
  it("gives every student a grip handle, so a drag is never started by accident", () => {
    setup();

    expect(left().getAllByRole("button", { name: /verschieben/ })).toHaveLength(2);
    expect(right().getAllByRole("button", { name: /verschieben/ })).toHaveLength(1);
  });

  it("assigns a student dragged onto the event", async () => {
    setup();

    await drag("Berger Bene", "{ArrowRight}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger"]));
  });

  it("unassigns a student dragged back out of the event", async () => {
    setup();

    await drag("Cerny Clara", "{ArrowLeft}");

    await waitFor(() => expect(onUnassign).toHaveBeenCalledWith(["record-Cerny"]));
  });

  it("takes the whole selection along, exactly as the move button does", async () => {
    setup();

    await userEvent.click(left().getByRole("checkbox", { name: "Berger Bene" }));
    await userEvent.click(left().getByRole("checkbox", { name: "Muster Anna" }));
    await drag("Berger Bene", "{ArrowRight}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger", "record-Muster"]));
  });

  it("takes only the dragged student when they are not part of the selection", async () => {
    setup();

    await userEvent.click(left().getByRole("checkbox", { name: "Muster Anna" }));
    await drag("Berger Bene", "{ArrowRight}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger"]));
  });

  it("leaves both lists alone when the drag is cancelled", async () => {
    setup();

    await drag("Berger Bene", "{ArrowRight}", "{Escape}");

    expect(onAssign).not.toHaveBeenCalled();
    expect(onUnassign).not.toHaveBeenCalled();
  });

  it("does nothing when a student is dropped back on the list they came from", async () => {
    setup();

    await drag("Berger Bene", "{ArrowLeft}");

    expect(onAssign).not.toHaveBeenCalled();
    expect(onUnassign).not.toHaveBeenCalled();
  });

  it("shows the list under the drag that it is a place to drop on", async () => {
    setup();

    handleOf("Berger Bene").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Zugeteilt: Montafon" }).className).toContain(
        "ring",
      ),
    );
  });
});
