/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";
import { storedEventSeries } from "@/test/event-series";

const useEventSeries = vi.fn();
const useRoster = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const apiRequest = vi.fn();
const useInvitations = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));
vi.mock("@/lib/invitations/use-invitations", () => ({
  useInvitations: (id: string) => useInvitations(id),
}));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {} }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { OverviewView: ScopedOverviewView } = await import("./overview-view");
const { NO_EVENT_SERIES_HINT, EVENT_SERIES_STATE_LABELS } =
  await import("@/lib/event-series/event-series-state");
const { ApiRequestError } = await import("@/lib/api/client");

// Which series the view is about comes from the page (Q8); the data hooks are mocked, so the id
// only has to be present.
function OverviewView() {
  return <ScopedOverviewView eventSeriesId="s1" />;
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
  apiRequest.mockResolvedValue(undefined);
  useInvitations.mockReturnValue({
    tokenFor: () => "tok",
    linkFor: vi.fn(async () => "tok"),
    regenerate: vi.fn(async () => "fresh"),
    loading: false,
    error: null,
  });
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

describe("OverviewView", () => {
  it("titles the page", () => {
    render(<OverviewView />);

    // Level 1: every card has a "Statistik" area heading of its own further down.
    expect(screen.getByRole("heading", { name: "Übersicht", level: 1 })).toBeInTheDocument();
  });

  it("shows a card per maintained class, counting the registrations of the active event series", () => {
    render(<OverviewView />);

    expect(screen.getByRole("group", { name: "5AHIF" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "5AHIF" })).getByText("5AHIF: 2")).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByRole("group", { name: "5BHIF" })).toBeInTheDocument();
  });

  it("points at the event series list when the selection resolves to nothing", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: null });

    render(<OverviewView />);

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

    render(<OverviewView />);

    expect(screen.getByRole("group", { name: "5AHIF" })).toBeInTheDocument();
  });
});

/**
 * Pressing this tag is the whole of opening and closing registration (US-19, US-29). There is no
 * second control anywhere else — two controls for one decision would be two answers to it.
 */
describe("OverviewView — the registration tag", () => {
  const tag = () => screen.getByRole("button", { name: EVENT_SERIES_STATE_LABELS.open });

  it("reads that the series is open and shows the tag pressed", () => {
    render(<OverviewView />);

    expect(tag()).toHaveAttribute("aria-pressed", "true");
  });

  it("reads that a closed series is closed, and is not pressed", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isOpenToStudents: false }],
      loading: false,
      error: null,
    });

    render(<OverviewView />);

    const closed = screen.getByRole("button", { name: EVENT_SERIES_STATE_LABELS.closed });
    expect(closed).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the series when pressed", async () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isOpenToStudents: false }],
      loading: false,
      error: null,
    });
    render(<OverviewView />);

    await userEvent.click(screen.getByRole("button", { name: EVENT_SERIES_STATE_LABELS.closed }));

    expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1", {
      method: "PATCH",
      body: { isOpenToStudents: true },
    });
  });

  it("closes it again when pressed while open", async () => {
    render(<OverviewView />);

    await userEvent.click(tag());

    expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1", {
      method: "PATCH",
      body: { isOpenToStudents: false },
    });
  });

  it("says what the server said when the change is refused", async () => {
    apiRequest.mockRejectedValue(new ApiRequestError("Eine Vorlage geht nicht."));
    render(<OverviewView />);

    await userEvent.click(tag());

    expect(await screen.findByRole("alert")).toHaveTextContent("Eine Vorlage geht nicht.");
  });

  /** A page that offers to open what cannot be opened is a page explaining a refusal it need not make. */
  it("offers no tag at all for a template, which can never be opened", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isTemplate: true, isOpenToStudents: false }],
      loading: false,
      error: null,
    });

    render(<OverviewView />);

    expect(screen.queryByRole("button", { name: /Anmeldung/ })).not.toBeInTheDocument();
  });

  it("offers no tag for an archived series, which cannot even be selected", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isArchived: true, isOpenToStudents: false }],
      loading: false,
      error: null,
    });

    render(<OverviewView />);

    expect(screen.queryByRole("button", { name: /Anmeldung/ })).not.toBeInTheDocument();
  });
});

describe("OverviewView — handing out links", () => {
  it("gives each class card the series' own links", async () => {
    render(<OverviewView />);

    expect(useInvitations).toHaveBeenCalledWith("s1");
    expect(
      within(screen.getByRole("group", { name: "5AHIF" })).getByRole("button", {
        name: "Link für 5AHIF kopieren",
      }),
    ).toBeInTheDocument();
  });

  /** A series that can never be opened has no link to hand out either (US-19, US-22). */
  it("offers no links for a template", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isTemplate: true, isOpenToStudents: false }],
      loading: false,
      error: null,
    });

    render(<OverviewView />);

    expect(screen.queryByRole("button", { name: /Link für/ })).not.toBeInTheDocument();
  });

  it("offers no links for an archived series", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [{ ...eventSeries, isArchived: true, isOpenToStudents: false }],
      loading: false,
      error: null,
    });

    render(<OverviewView />);

    expect(screen.queryByRole("button", { name: /Link für/ })).not.toBeInTheDocument();
  });

  it("reports a refused read of the links rather than showing none", () => {
    useInvitations.mockReturnValue({
      tokenFor: () => null,
      linkFor: vi.fn(),
      regenerate: vi.fn(),
      loading: false,
      error: "Nicht erlaubt.",
    });

    render(<OverviewView />);

    expect(screen.getByRole("alert")).toHaveTextContent("Nicht erlaubt.");
  });
});
