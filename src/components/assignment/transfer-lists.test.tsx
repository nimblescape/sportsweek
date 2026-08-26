/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
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

const upper = () => within(screen.getByRole("group", { name: "Nicht zugeteilt" }));
const lower = () => within(screen.getByRole("group", { name: "Zugeteilt: Montafon" }));

beforeEach(() => {
  onAssign.mockReset().mockResolvedValue(undefined);
  onUnassign.mockReset().mockResolvedValue(undefined);
});

describe("TransferLists", () => {
  it("asks for a week first, since the lower list is one week's students", () => {
    setup({ eventName: null });

    expect(screen.getByText(/Woche/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Nicht zugeteilt" })).not.toBeInTheDocument();
  });

  it("puts the unassigned students above the week's own", () => {
    setup();

    const labels = screen
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label") ?? "")
      .filter((label) => !label.endsWith("Filter"));

    expect(labels).toEqual(["Nicht zugeteilt", "Zugeteilt: Montafon"]);
  });

  it("lists the students it was given on each side", () => {
    setup();

    expect(upper().getByRole("button", { name: "Berger Bene" })).toBeInTheDocument();
    expect(lower().getByRole("button", { name: "Cerny Clara" })).toBeInTheDocument();
  });

  it("counts what the filter leaves in each title", () => {
    setup();

    expect(upper().getByText("Nicht zugeteilt: 2")).toBeInTheDocument();
    expect(lower().getByText("Montafon: 1")).toBeInTheDocument();
  });

  it("titles the lower list with the week itself, the card above having said the rest", () => {
    setup();

    expect(lower().queryByText(/^Zugeteilt/)).not.toBeInTheDocument();
  });

  it("counts what the filter leaves, not what the list holds", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(upper().getByText("Nicht zugeteilt: 1")).toBeInTheDocument();
    expect(upper().queryByRole("button", { name: "Muster Anna" })).not.toBeInTheDocument();
  });

  it("filters each list on its own", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(lower().getByRole("button", { name: "Cerny Clara" })).toBeInTheDocument();
  });

  it("offers no box to tick — a picked student is a coloured row", async () => {
    setup();

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    await userEvent.click(upper().getByRole("button", { name: "Berger Bene" }));

    const picked = upper().getByRole("button", { name: "Berger Bene" });
    expect(picked).toHaveAttribute("aria-pressed", "true");
    expect(picked.parentElement?.className).toContain("bg-accent");
  });

  it("picks a student and lets go of them again", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Berger Bene" }));
    await userEvent.click(upper().getByRole("button", { name: "Berger Bene" }));

    expect(upper().getByRole("button", { name: "Berger Bene" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps a student picked when the filter stops showing them", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Muster Anna" }));
    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));
    expect(upper().queryByRole("button", { name: "Muster Anna" })).not.toBeInTheDocument();

    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));
    expect(upper().getByRole("button", { name: "Muster Anna" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("picks everyone the filter leaves, through the list's first entry", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));

    for (const name of ["Berger Bene", "Muster Anna"]) {
      expect(upper().getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("picks nobody the filter hides", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));
    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));
    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(upper().getByRole("button", { name: "Muster Anna" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lets go of everyone again when they are all picked", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));
    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));

    expect(upper().getByRole("button", { name: "Berger Bene" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks its own 'Alle' only, so one list does not pick for the other", async () => {
    setup();

    await userEvent.click(upper().getByRole("button", { name: "Alle auswählen" }));

    expect(lower().getByRole("button", { name: "Alle auswählen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("offers no move buttons, since dragging is the only way across", () => {
    setup();

    expect(screen.queryByRole("button", { name: "Auswahl zuteilen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zuteilung aufheben" })).not.toBeInTheDocument();
  });

  it("offers no 'Alle' while the filter leaves nobody to pick", async () => {
    setup({ assigned: [] });

    expect(lower().queryByRole("button", { name: "Alle auswählen" })).not.toBeInTheDocument();
    expect(lower().getByText("Montafon: 0")).toBeInTheDocument();

    await userEvent.click(upper().getByRole("button", { name: "Geschlecht: weiblich" }));
    await userEvent.click(upper().getByRole("button", { name: "Klasse: 5BHIF" }));

    expect(upper().getByText("Nicht zugeteilt: 0")).toBeInTheDocument();
    expect(upper().queryByRole("button", { name: "Alle auswählen" })).not.toBeInTheDocument();
  });
});
