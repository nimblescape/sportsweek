/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { storedEventSeries } from "@/test/event-series";

const useEventSeries = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {} }));

const { StatisticsView: ScopedStatisticsView } = await import("./statistics-view");
const { NO_EVENT_SERIES_HINT } = await import("@/lib/event-series/event-series-state");

// Which series the view is about comes from the page (Q8); the data hooks are mocked, so the id
// only has to be present.
function StatisticsView() {
  return <ScopedStatisticsView eventSeriesId="s1" />;
}

function student(
  lastName: string,
  overrides: Partial<Omit<RosterStudent, "record">> = {},
): RosterStudent {
  return rosterStudent({
    id: `record-${lastName}`,
    studentUpn: `${lastName}@student.htldornbirn.at`,
    firstName: "Vorname",
    lastName,
    ...overrides,
  });
}

const eventSeries = {
  id: "s1",
  ...storedEventSeries({ name: "2026", isOpenToStudents: true, hasRegistrations: true }),
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

  it("points at the event series list when the selection resolves to nothing", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: null });

    render(<StatisticsView />);

    expect(screen.getByText(NO_EVENT_SERIES_HINT)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "5AHIF" })).not.toBeInTheDocument();
  });

  /** The header decides which series a page is about, so several on offer is the normal case. */
  it("counts the event series the page names, not whichever came first", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, id: "s0" }, eventSeries],
      loading: false,
      error: null,
    });

    render(<StatisticsView />);

    expect(screen.getByRole("group", { name: "5AHIF" })).toBeInTheDocument();
  });
});
