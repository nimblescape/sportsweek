/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";

const useEventSeries = vi.fn();
const useRoster = vi.fn();
const useEvents = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/events/use-events", () => ({ useEvents: (id: string) => useEvents(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {} }));

const { StatisticsView } = await import("./statistics-view");

function student(
  lastName: string,
  overrides: Partial<Omit<RosterStudent, "record">> = {},
): RosterStudent {
  return rosterStudent({
    id: `record-${lastName}`,
    userId: `${lastName}@student.htldornbirn.at`,
    firstName: "Vorname",
    lastName,
    ...overrides,
  });
}

const eventSeries = {
  id: "s1",
  name: "2026",
  isActive: true,
  isArchived: false,
  hasRegistrations: true,
  position: 0,
};

const listOf = (...names: string[]) => ({ items: names, loading: false, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  useEventSeries.mockReturnValue({ eventSeries: [eventSeries], loading: false, error: null });
  useRoster.mockReturnValue({
    students: [student("Muster"), student("Cerny", { isAttending: false })],
    loading: false,
    error: null,
  });
  useEvents.mockReturnValue({ events: [], loading: false, error: null });
  useMasterData.mockImplementation((key: string) =>
    key === "classes" ? listOf("5AHIF", "5BHIF") : listOf("Profi"),
  );
  usePrograms.mockReturnValue({
    programs: [{ name: "Ski", requiredEquipment: [] }],
    loading: false,
    error: null,
  });
});

describe("StatisticsView", () => {
  it("titles the page", () => {
    render(<StatisticsView />);

    // Level 1: every card has a "Statistik" area heading of its own further down.
    expect(screen.getByRole("heading", { name: "Statistik", level: 1 })).toBeInTheDocument();
  });

  it("shows a card per maintained class, counting the registrations of the active event series", () => {
    render(<StatisticsView />);

    expect(screen.getByRole("group", { name: "5AHIF" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "5AHIF" })).getByText("5AHIF: 2")).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByRole("group", { name: "5BHIF" })).toBeInTheDocument();
  });

  it("says so while no event series is active, since there is nothing to count", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: null });

    render(<StatisticsView />);

    expect(screen.getByText("Es ist keine Eventreihe aktiv.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "5AHIF" })).not.toBeInTheDocument();
  });

  it("reports two active event series rather than taking the page down with it", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [eventSeries, { ...eventSeries, id: "s2" }],
      loading: false,
      error: null,
    });

    render(<StatisticsView />);

    expect(screen.getByRole("alert")).toHaveTextContent(/aktiv/i);
  });
});
