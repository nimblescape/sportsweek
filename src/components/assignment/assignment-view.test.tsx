/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { storedEventSeries } from "@/test/event-series";
import { stubBoardLayout } from "@/test/stub-board-layout";

const useEventSeries = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const apiRequest = vi.fn();
const useBusyWhile = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock("@/lib/api/busy", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBusyWhile: (busy: boolean) => useBusyWhile(busy),
}));

const { AssignmentView: ScopedAssignmentView } = await import("./assignment-view");
const { NO_EVENT_SERIES_HINT } = await import("@/lib/event-series/event-series-state");

// Which series the view is about comes from the page (Q8); the roster hook is mocked, so the id
// only has to be present.
function AssignmentView() {
  return <ScopedAssignmentView eventSeriesId="s1" />;
}

function student(
  firstName: string,
  lastName: string,
  overrides: Partial<Omit<RosterStudent, "record">> = {},
): RosterStudent {
  return rosterStudent({
    id: asUid(`record-${lastName}`),
    studentUid: asUid(`uid-${lastName}`),
    firstName,
    lastName,
    ...overrides,
  });
}

const ANNA = student("Anna", "Muster");
const BENE = student("Bene", "Berger", { event: "Montafon" });
const CLARA = student("Clara", "Cerny", { isAttending: false });

/** The events are a field of this document, so a series arrives with its own weeks (US-21). */
const eventSeries = {
  id: "s1",
  ...storedEventSeries({
    name: "2026",
    isOpenToStudents: true,
    hasRegistrations: true,
    events: ["Montafon", "Gardasee"],
  }),
};

const listOf = (...names: string[]) => ({ items: names, loading: false, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  stubBoardLayout();
  useEventSeries.mockReturnValue({ eventSeries: [eventSeries], loading: false, error: null });
  useRoster.mockReturnValue({ students: [ANNA, BENE, CLARA], loading: false, error: null });
  useMasterData.mockImplementation((key: string) =>
    key === "classes" ? listOf("5AHIF", "5BHIF") : listOf("Profi"),
  );
  usePrograms.mockReturnValue({
    programs: [{ name: "Ski", requiredEquipment: [] }],
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
  it("points at the event series list when the selection resolves to nothing", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: null });

    render(<AssignmentView />);

    expect(screen.getByText(NO_EVENT_SERIES_HINT)).toBeInTheDocument();
  });

  /** An empty list that has not arrived yet is not an answer; saying so made the pages flicker. */
  it("says nothing about the selection while the list is still arriving", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: true, error: null });

    render(<AssignmentView />);

    expect(screen.queryByText(NO_EVENT_SERIES_HINT)).not.toBeInTheDocument();
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
      expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Muster"], event: "Montafon" },
      }),
    );
  });

  it("takes the week away from a student dragged back onto the unassigned card", async () => {
    render(<AssignmentView />);

    await drag("Montafon", "Berger Bene", "{ArrowUp}");

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Berger"], event: null },
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

  /**
   * The indicator answers for writes. A teacher moving between the pages of a series is reading,
   * and an indicator that fired on every page would be reporting the app working rather than
   * anything the teacher started.
   */
  it("reports nothing while it is only reading", () => {
    useRoster.mockReturnValue({ students: [], loading: true, error: null });

    render(<AssignmentView />);

    expect(useBusyWhile).not.toHaveBeenCalledWith(true);
  });

  it("tells the teacher when an event series has no events to assign to yet", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, events: [] }],
      loading: false,
      error: null,
    });

    render(<AssignmentView />);

    expect(screen.getByText(/keine Events angelegt/)).toBeInTheDocument();
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
