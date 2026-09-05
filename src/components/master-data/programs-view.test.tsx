/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IN_USE_HINT } from "@/lib/master-data/categories";
import { IRREVERSIBLE_HINT } from "@/lib/ui/hints";

const useMasterData = vi.fn();
const useProgram = vi.fn();
const useUsageReport = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (...args: unknown[]) => useMasterData(...args),
  useProgram: (...args: unknown[]) => useProgram(...args),
  useUsageReport: (...args: unknown[]) => useUsageReport(...args),
}));

// The screen names the record it is about, which reaches Firebase no test here has cause to start.
vi.mock("@/lib/event-series/use-selected-event-series", () => ({
  useSelectedEventSeries: () => ({
    eventSeries: { id: "s1", name: "Wintersportwoche" },
    loading: false,
    error: null,
  }),
}));

const { ProgramsView: ScopedProgramsView } = await import("./programs-view");
const { ProgramEquipmentView: ScopedProgramEquipmentView } =
  await import("./program-equipment-view");

// Which series the lists belong to comes from the page (Q8); the data hooks are mocked here.
function ProgramsView({
  eventSeriesId = "s1",
  eventName,
}: {
  eventSeriesId?: string;
  eventName?: string;
}) {
  return <ScopedProgramsView eventSeriesId={eventSeriesId} eventName={eventName} />;
}

function ProgramEquipmentView({
  program,
  eventSeriesId = "s1",
  eventName,
}: {
  program: string;
  eventSeriesId?: string;
  eventName?: string;
}) {
  return (
    <ScopedProgramEquipmentView
      program={program}
      eventSeriesId={eventSeriesId}
      eventName={eventName}
    />
  );
}

const ski = { name: "Ski", requiredEquipment: ["Helm", "Stöcke"] };

function stubFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ item: ski }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  vi.clearAllMocks();
  useMasterData.mockReturnValue({ items: ["Ski", "Alternativ"], loading: false, error: null });
  useProgram.mockReturnValue({ program: ski, loading: false, error: null });
  useUsageReport.mockReturnValue({
    blockedNames: new Set<string>(),
    blockedEquipment: {},
    loading: false,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ProgramsView", () => {
  it("lists the programs", () => {
    render(<ProgramsView />);

    expect(screen.getByRole("button", { name: "Programme: Neues Programm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Ski")).toBeInTheDocument();
  });

  /** A name is the identity (US-21), and it may hold a character a path segment cannot carry. */
  it("names the program its equipment list belongs to in a search parameter", () => {
    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Ski" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/programs?equipment=Ski",
    );
  });

  it("percent-encodes a name a URL would otherwise read as structure", () => {
    useMasterData.mockReturnValue({ items: ["Ski & Board"], loading: false, error: null });

    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Ski & Board" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/programs?equipment=Ski%20%26%20Board",
    );
  });

  it("keeps the equipment list reachable for a program the in-use guard blocks", () => {
    useUsageReport.mockReturnValue({
      blockedNames: new Set(["Ski"]),
      blockedEquipment: {},
      loading: false,
    });
    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Ski" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Programm Ski bearbeiten" })).toBeDisabled();
  });

  it("locks the way into the equipment while a write on that program is in flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<ProgramsView />);

    await userEvent.click(screen.getByRole("button", { name: "Programm Ski löschen" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Ski" })).toHaveAttribute("aria-disabled", "true"),
    );
    expect(screen.getByRole("link", { name: "Alternativ" })).not.toHaveAttribute("aria-disabled");
  });
});

describe("ProgramEquipmentView", () => {
  it("reads the program named in the URL, from the series the page names", () => {
    render(<ProgramEquipmentView program="Ski" />);

    expect(useProgram).toHaveBeenCalledWith("Ski", "s1", undefined);
  });

  it("lists the entries the program carries, and names the program", () => {
    render(<ProgramEquipmentView program="Ski" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ski");
    expect(screen.getByText("Helm")).toBeInTheDocument();
    expect(screen.getByText("Stöcke")).toBeInTheDocument();
  });

  it("offers a way back to the programs list of the same series", () => {
    render(<ProgramEquipmentView program="Ski" />);

    const trail = screen.getByRole("navigation", { name: "Pfad" });

    expect(within(trail).getByRole("link", { name: "Programme" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/programs",
    );
  });

  /** The path is the record's whole address, so it names the series and the collection above it. */
  it("names every step down to the program", () => {
    render(<ProgramEquipmentView program="Ski" />);

    const trail = screen.getByRole("navigation", { name: "Pfad" });

    expect(within(trail).getByRole("link", { name: "Eventreihen" })).toBeInTheDocument();
    expect(within(trail).getByRole("link", { name: "Wintersportwoche" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/classes",
    );
    // The equipment leaf offers one tag, so the path ends at the program rather than repeating it.
    expect(within(trail).getByRole("heading", { level: 1 })).toHaveTextContent("Ski");
  });

  /**
   * Both views are the same page, told apart by the equipment parameter — so the way in and the
   * way back are one address. Checking each against its own literal is what let the way back keep
   * a path from before the series was a segment, which answers 404.
   */
  it("goes back to the address the equipment link came from", () => {
    const { unmount } = render(<ProgramsView />);
    const wayIn = screen.getByRole("link", { name: "Ski" }).getAttribute("href");
    unmount();

    render(<ProgramEquipmentView program="Ski" />);

    const trail = screen.getByRole("navigation", { name: "Pfad" });
    expect(within(trail).getByRole("link", { name: "Programme" })).toHaveAttribute(
      "href",
      wayIn?.split("?")[0],
    );
  });

  it("percent-encodes a series id a URL would otherwise read as structure", () => {
    render(<ProgramEquipmentView program="Ski" eventSeriesId="winter 2026/27" />);

    const trail = screen.getByRole("navigation", { name: "Pfad" });
    expect(within(trail).getByRole("link", { name: "Programme" })).toHaveAttribute(
      "href",
      "/app/event-series/winter%202026%2F27/programs",
    );
  });

  it("renders a program with no equipment as an empty list rather than an error", () => {
    useProgram.mockReturnValue({
      program: { name: "Alternativ", requiredEquipment: [] },
      loading: false,
      error: null,
    });

    render(<ProgramEquipmentView program="Alternativ" />);

    expect(screen.getByText("Dieses Programm benötigt keine Ausrüstung.")).toBeInTheDocument();
  });

  /** The list is a field of the program, so a change names the program and rewrites it whole. */
  it("appends a new entry rather than replacing the list", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView program="Ski" />);

    await userEvent.click(screen.getByRole("button", { name: /neuer ausrüstungsgegenstand/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Brille");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/event-series/s1/master-data/programs");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(fetchMock)).toEqual({
      item: "Ski",
      requiredEquipment: ["Helm", "Stöcke", "Brille"],
    });
  });

  it("renames an entry in place, keeping the order", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView program="Ski" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm bearbeiten" }),
    );
    const field = screen.getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.type(field, "Skihelm");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ item: "Ski", requiredEquipment: ["Skihelm", "Stöcke"] });
  });

  it("removes an entry by rewriting the list without it", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView program="Ski" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ item: "Ski", requiredEquipment: ["Stöcke"] });
  });

  it("warns that removing an entry cannot be undone", async () => {
    stubFetch();
    render(<ProgramEquipmentView program="Ski" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(IRREVERSIBLE_HINT);
  });

  /** The report is keyed by program name, since a name is what identifies a program (US-21). */
  it("disables an entry a student of an open event series still rents", () => {
    useUsageReport.mockReturnValue({
      blockedNames: new Set<string>(),
      blockedEquipment: { Ski: ["Helm"] },
      loading: false,
    });

    render(<ProgramEquipmentView program="Ski" />);

    expect(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm bearbeiten" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    ).toBeDisabled();
    expect(screen.getAllByText(IN_USE_HINT).length).toBeGreaterThan(0);
  });

  it("leaves the entries of other programs alone", () => {
    useUsageReport.mockReturnValue({
      blockedNames: new Set<string>(),
      blockedEquipment: { Snowboard: ["Helm"] },
      loading: false,
    });

    render(<ProgramEquipmentView program="Ski" />);

    expect(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    ).toBeEnabled();
  });
});

describe("an event's own programs (US-33)", () => {
  it("reads and writes the event's own programs list, not the series'", async () => {
    const fetchMock = stubFetch();
    render(<ProgramsView eventName="Woche 1" />);

    expect(useMasterData).toHaveBeenCalledWith("programs", "s1", "Woche 1");

    await userEvent.click(screen.getByRole("button", { name: "Programm Ski löschen" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/event-series/s1/events/master-data/programs?event=Woche%201");
  });

  it("names an event's own program's equipment in a search parameter, beside the event's", () => {
    render(<ProgramsView eventName="Woche 1" />);

    expect(screen.getByRole("link", { name: "Ski" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/events/programs?event=Woche%201&equipment=Ski",
    );
  });

  it("reads and writes an event's own program's equipment, not the series'", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView program="Ski" eventName="Woche 1" />);

    expect(useProgram).toHaveBeenCalledWith("Ski", "s1", "Woche 1");

    await userEvent.click(screen.getByRole("button", { name: /neuer ausrüstungsgegenstand/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Brille");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/event-series/s1/events/master-data/programs?event=Woche%201");
  });

  it("names the whole path down to the event's own program, ending at it", () => {
    render(<ProgramEquipmentView program="Ski" eventName="Woche 1" />);

    const trail = screen.getByRole("navigation", { name: "Pfad" });

    expect(within(trail).getByRole("link", { name: "Events" })).toBeInTheDocument();
    expect(within(trail).getByRole("link", { name: "Woche 1" })).toBeInTheDocument();
    expect(within(trail).getByRole("heading", { level: 1 })).toHaveTextContent("Ski");
  });
});
