/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { stubBoardLayout } from "@/test/stub-board-layout";

const useEventSeries = vi.fn();
const useEvents = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const apiRequest = vi.fn();
const useBusyWhile = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));
vi.mock("@/lib/events/use-events", () => ({ useEvents: (id: string) => useEvents(id) }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: (busy: boolean) => useBusyWhile(busy) }));

const { AssignmentView } = await import("./assignment-view");

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
const BENE = student("Bene", "Berger", { eventId: "event1" });
const CLARA = student("Clara", "Cerny", { isAttending: false });

const eventSeries = {
  id: "s1",
  name: "2026",
  isActive: true,
  isArchived: false,
  hasRegistrations: true,
  position: 0,
};

const listOf = (...names: string[]) => ({
  items: names.map((name, position) => ({ id: name, name, position })),
  loading: false,
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  stubBoardLayout();
  useEventSeries.mockReturnValue({ eventSeries: [eventSeries], loading: false, error: null });
  useEvents.mockReturnValue({
    events: [
      { id: "event1", eventSeriesId: "s1", name: "Montafon", position: 0 },
      { id: "event2", eventSeriesId: "s1", name: "Gardasee", position: 1 },
    ],
    loading: false,
    error: null,
  });
  useRoster.mockReturnValue({ students: [ANNA, BENE, CLARA], loading: false, error: null });
  useMasterData.mockImplementation((key: string) =>
    key === "classes" ? listOf("5AHIF", "5BHIF") : listOf("Profi"),
  );
  usePrograms.mockReturnValue({
    programs: [{ id: "p1", name: "Ski", position: 0, requiredEquipment: [] }],
    loading: false,
    error: null,
  });
  apiRequest.mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

const card = (name: string) => within(screen.getByRole("group", { name }));

async function drag(from: string, row: string, direction: "{ArrowDown}" | "{ArrowUp}") {
  card(from)
    .getByRole("button", { name: `${row} verschieben` })
    .focus();
  await userEvent.keyboard("{ }");
  await userEvent.keyboard(direction);
  await userEvent.keyboard("{ }");
}

describe("AssignmentView", () => {
  it("says so while no event series is active, since there is nothing to assign", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: null });

    render(<AssignmentView />);

    expect(screen.getByText("Es ist keine Eventreihe aktiv.")).toBeInTheDocument();
  });

  /** How the classes stand is a page of its own now; this one is the board and nothing else. */
  it("shows no class cards, which live under Statistik", () => {
    render(<AssignmentView />);

    expect(screen.queryByRole("group", { name: "5AHIF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "5BHIF" })).not.toBeInTheDocument();
  });

  it("puts every attending student in the card of the week they belong to", () => {
    render(<AssignmentView />);

    expect(
      card("Nicht zugeteilt").getByRole("button", { name: "Muster Anna" }),
    ).toBeInTheDocument();
    expect(card("Montafon").getByRole("button", { name: "Berger Bene" })).toBeInTheDocument();
  });

  it("keeps a student who is not attending out of every card", () => {
    render(<AssignmentView />);

    expect(screen.queryByRole("button", { name: "Cerny Clara" })).not.toBeInTheDocument();
  });

  it("assigns a student dragged onto a week", async () => {
    render(<AssignmentView />);

    await drag("Nicht zugeteilt", "Muster Anna", "{ArrowDown}");

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Muster"], eventId: "event1" },
      }),
    );
  });

  it("takes the week away from a student dragged back onto the unassigned card", async () => {
    render(<AssignmentView />);

    await drag("Montafon", "Berger Bene", "{ArrowUp}");

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Berger"], eventId: null },
      }),
    );
  });

  it("holds the whole view and lights the shared spinner while the move is saved", async () => {
    let settle = () => {};
    apiRequest.mockReturnValue(
      new Promise<null>((resolve) => {
        settle = () => resolve(null);
      }),
    );

    render(<AssignmentView />);
    await drag("Nicht zugeteilt", "Muster Anna", "{ArrowDown}");

    await waitFor(() => expect(useBusyWhile).toHaveBeenCalledWith(true));
    settle();
  });

  it("tells the teacher when an event series has no events to assign to yet", () => {
    useEvents.mockReturnValue({ events: [], loading: false, error: null });

    render(<AssignmentView />);

    expect(screen.getByText(/noch keine Events/)).toBeInTheDocument();
  });

  it("keeps a card's filter when another card is filtered", async () => {
    render(<AssignmentView />);

    await userEvent.click(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" }));
    await userEvent.click(card("Montafon").getByRole("button", { name: "Klasse: 5AHIF" }));

    expect(card("Nicht zugeteilt").getByRole("button", { name: "Klasse: 5BHIF" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
