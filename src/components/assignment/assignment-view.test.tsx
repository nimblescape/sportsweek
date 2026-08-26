/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";

const useSeasons = vi.fn();
const useEvents = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const apiRequest = vi.fn();

vi.mock("@/lib/seasons/use-seasons", () => ({ useSeasons: () => useSeasons() }));
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
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {} }));

const { AssignmentView } = await import("./assignment-view");

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
const BENE = student("Bene", "Berger", { eventId: "event1" });
const CLARA = student("Clara", "Cerny", { isAttending: false });

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
  useEvents.mockReturnValue({
    events: [
      { id: "event1", seasonId: "s1", name: "Montafon", position: 0 },
      { id: "event2", seasonId: "s1", name: "Gardasee", position: 1 },
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

const left = () => within(screen.getByRole("region", { name: "Nicht zugeteilt" }));
const right = () => within(screen.getByRole("region", { name: "Zugeteilt: Montafon" }));

describe("AssignmentView", () => {
  it("says so while no season is active, since there is nothing to assign", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: false, error: null });

    render(<AssignmentView />);

    expect(screen.getByText("Es ist keine Saison aktiv.")).toBeInTheDocument();
  });

  it("counts every registration of the season by class, attending or not", () => {
    render(<AssignmentView />);

    const row = within(screen.getByRole("row", { name: /^5AHIF/ }))
      .getAllByRole("cell")
      .map((cell) => cell.textContent);

    expect(row.slice(0, 4)).toEqual(["5AHIF", "3", "2", "67 %"]);
  });

  it("waits for an event to be picked before offering the lists", () => {
    render(<AssignmentView />);

    expect(screen.queryByRole("region", { name: "Nicht zugeteilt" })).not.toBeInTheDocument();
  });

  it("splits the attending students by the event that was picked", async () => {
    render(<AssignmentView />);

    await userEvent.click(screen.getByRole("radio", { name: "Montafon" }));

    expect(left().getByRole("checkbox", { name: "Muster Anna" })).toBeInTheDocument();
    expect(right().getByRole("checkbox", { name: "Berger Bene" })).toBeInTheDocument();
  });

  it("keeps a student who is not attending out of both lists", async () => {
    render(<AssignmentView />);

    await userEvent.click(screen.getByRole("radio", { name: "Montafon" }));

    expect(screen.queryByRole("checkbox", { name: "Cerny Clara" })).not.toBeInTheDocument();
  });

  it("shows an event's students only under that event", async () => {
    render(<AssignmentView />);

    await userEvent.click(screen.getByRole("radio", { name: "Gardasee" }));

    expect(
      within(screen.getByRole("region", { name: "Zugeteilt: Gardasee" })).getByText("0 angezeigt"),
    ).toBeInTheDocument();
  });

  it("assigns the selection to the picked event", async () => {
    render(<AssignmentView />);

    await userEvent.click(screen.getByRole("radio", { name: "Montafon" }));
    await userEvent.click(left().getByRole("checkbox", { name: "Muster Anna" }));
    await userEvent.click(screen.getByRole("button", { name: "Auswahl zuteilen" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Muster"], eventId: "event1" },
      }),
    );
  });

  it("unassigns without naming an event, which is what makes a move a two-step one", async () => {
    render(<AssignmentView />);

    await userEvent.click(screen.getByRole("radio", { name: "Montafon" }));
    await userEvent.click(right().getByRole("checkbox", { name: "Berger Bene" }));
    await userEvent.click(screen.getByRole("button", { name: "Zuteilung aufheben" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/assignments", {
        method: "PATCH",
        body: { recordIds: ["record-Berger"], eventId: null },
      }),
    );
  });

  it("tells the teacher when a season has no events to assign to yet", () => {
    useEvents.mockReturnValue({ events: [], loading: false, error: null });

    render(<AssignmentView />);

    expect(screen.getByText(/noch keine Events/)).toBeInTheDocument();
  });
});
