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
import { stubTransferLayout } from "@/test/stub-transfer-layout";
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
const BENE = student("Bene", "Berger", { class: "5BHIF" });
const CLARA = student("Clara", "Cerny", { eventId: "event1" });

const onAssign = vi.fn();
const onUnassign = vi.fn();

/**
 * Stacks the two lists for the duration of a test: jsdom reports a zero rect for everything,
 * which leaves drag-and-drop unable to tell the upper list from the lower one.
 */
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

const upper = () => within(screen.getByRole("group", { name: "Nicht zugeteilt" }));
const handleOf = (name: string) => screen.getByRole("button", { name: `${name} verschieben` });

async function dragHandle(
  handle: HTMLElement,
  direction: "{ArrowDown}" | "{ArrowUp}",
  drop = "{ }",
) {
  handle.focus();
  await userEvent.keyboard("{ }");
  await userEvent.keyboard(direction);
  await userEvent.keyboard(drop);
}

const drag = (name: string, direction: "{ArrowDown}" | "{ArrowUp}", drop = "{ }") =>
  dragHandle(handleOf(name), direction, drop);

beforeEach(() => {
  onAssign.mockReset().mockResolvedValue(undefined);
  onUnassign.mockReset().mockResolvedValue(undefined);
  stubTransferLayout();
});

afterEach(() => vi.restoreAllMocks());

describe("TransferLists — drag and drop", () => {
  it("gives every row a grip handle, 'Alle' among them", () => {
    setup();

    expect(upper().getAllByRole("button", { name: /verschieben/ })).toHaveLength(3);
    expect(upper().getByRole("button", { name: "Alle auswählen verschieben" })).toBeInTheDocument();
  });
  it("moves everyone the filter leaves when 'Alle' is dragged", async () => {
    setup();

    await dragHandle(
      upper().getByRole("button", { name: "Alle auswählen verschieben" }),
      "{ArrowDown}",
    );

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger", "record-Muster"]));
  });

  it("moves only what the filter leaves when 'Alle' is dragged", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));
    await dragHandle(
      upper().getByRole("button", { name: "Alle auswählen verschieben" }),
      "{ArrowDown}",
    );

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger"]));
  });

  it("assigns a student dragged down onto the week", async () => {
    setup();

    await drag("Berger Bene", "{ArrowDown}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger"]));
  });

  it("unassigns a student dragged back up out of the week", async () => {
    setup();

    await drag("Cerny Clara", "{ArrowUp}");

    await waitFor(() => expect(onUnassign).toHaveBeenCalledWith(["record-Cerny"]));
  });

  it("takes the whole selection along", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));
    await drag("Berger Bene", "{ArrowDown}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger", "record-Muster"]));
  });

  it("takes a picked student the filter hides along too, since filtering never lets go", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));
    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));
    await drag("Berger Bene", "{ArrowDown}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger", "record-Muster"]));
  });

  it("takes only the dragged student when they are not part of the selection", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Muster Anna" }));
    await drag("Berger Bene", "{ArrowDown}");

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(["record-Berger"]));
  });

  it("leaves both lists alone when the drag is cancelled", async () => {
    setup();

    await drag("Berger Bene", "{ArrowDown}", "{Escape}");

    expect(onAssign).not.toHaveBeenCalled();
    expect(onUnassign).not.toHaveBeenCalled();
  });

  it("does nothing when a student is dropped back on the list they came from", async () => {
    setup();

    await drag("Berger Bene", "{ArrowUp}");

    expect(onAssign).not.toHaveBeenCalled();
    expect(onUnassign).not.toHaveBeenCalled();
  });

  it("shows the list under the drag that it is a place to drop on", async () => {
    setup();

    handleOf("Berger Bene").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Zugeteilt: Montafon" }).className).toContain(
        "ring",
      ),
    );
  });

  it("keeps a rejected move on screen and says why", async () => {
    onAssign.mockRejectedValue(
      new Error("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    );
    setup();

    await drag("Berger Bene", "{ArrowDown}");

    expect(
      await screen.findByText("Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    ).toBeInTheDocument();
  });

  it("lets go of the students it moved, and of nobody else", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Muster Anna" }));
    await drag("Berger Bene", "{ArrowDown}");

    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    expect(upper().getByRole("button", { name: "Muster Anna" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
