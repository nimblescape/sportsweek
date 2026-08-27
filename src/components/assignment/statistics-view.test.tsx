/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";

const useSeasons = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();

vi.mock("@/lib/seasons/use-seasons", () => ({ useSeasons: () => useSeasons() }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {} }));

const { StatisticsView } = await import("./statistics-view");

function student(lastName: string, overrides: Partial<RosterStudent> = {}): RosterStudent {
  return {
    id: `record-${lastName}`,
    userId: `${lastName}@student.htldornbirn.at`,
    firstName: "Vorname",
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

const season = {
  id: "s1",
  name: "2026",
  isActive: true,
  isArchived: false,
  hasStudentData: true,
  position: 0,
};

const listOf = (...names: string[]) => ({
  items: names.map((name, position) => ({ id: name, name, position })),
  loading: false,
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  useSeasons.mockReturnValue({ seasons: [season], loading: false, error: null });
  useRoster.mockReturnValue({
    students: [student("Muster"), student("Cerny", { isAttending: false })],
    loading: false,
    error: null,
  });
  useMasterData.mockImplementation((key: string) =>
    key === "classes" ? listOf("5AHIF", "5BHIF") : listOf("Profi"),
  );
  usePrograms.mockReturnValue({
    programs: [{ id: "p1", name: "Ski", position: 0, requiredEquipment: [] }],
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

  it("shows a card per maintained class, counting the registrations of the active season", () => {
    render(<StatisticsView />);

    expect(screen.getByRole("group", { name: "5AHIF" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "5AHIF" })).getByText("5AHIF: 2")).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByRole("group", { name: "5BHIF" })).toBeInTheDocument();
  });

  it("says so while no season is active, since there is nothing to count", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: false, error: null });

    render(<StatisticsView />);

    expect(screen.getByText("Es ist keine Saison aktiv.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "5AHIF" })).not.toBeInTheDocument();
  });

  it("reports two active seasons rather than taking the page down with it", () => {
    useSeasons.mockReturnValue({
      seasons: [season, { ...season, id: "s2" }],
      loading: false,
      error: null,
    });

    render(<StatisticsView />);

    expect(screen.getByRole("alert")).toHaveTextContent(/aktiv/i);
  });
});
