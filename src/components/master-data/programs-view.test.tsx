/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IN_USE_HINT } from "@/lib/master-data/categories";

const useMasterData = vi.fn();
const useProgram = vi.fn();
const useUsageReport = vi.fn();

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (...args: unknown[]) => useMasterData(...args),
  useProgram: (...args: unknown[]) => useProgram(...args),
  useUsageReport: (...args: unknown[]) => useUsageReport(...args),
}));

const { ProgramsView } = await import("./programs-view");
const { ProgramEquipmentView } = await import("./program-equipment-view");

const programs = [
  { id: "ski", name: "Ski" },
  { id: "alt", name: "Alternativ" },
];

const ski = { id: "ski", name: "Ski", requiredEquipment: ["Helm", "Stöcke"] };

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
  useMasterData.mockReturnValue({ items: programs, loading: false, error: null });
  useProgram.mockReturnValue({ program: ski, loading: false, error: null });
  useUsageReport.mockReturnValue({
    blockedIds: new Set<string>(),
    blockedEquipment: {},
    loading: false,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ProgramsView", () => {
  it("lists the programs", () => {
    render(<ProgramsView />);

    expect(screen.getByRole("heading", { name: "Programme" })).toBeInTheDocument();
    expect(screen.getByText("Ski")).toBeInTheDocument();
  });

  it("links each program to its own equipment list", () => {
    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Benötigte Ausrüstung für Ski" })).toHaveAttribute(
      "href",
      "/app/master-data/programs/ski",
    );
  });

  it("keeps the equipment list reachable for a program the in-use guard blocks", () => {
    useUsageReport.mockReturnValue({
      blockedIds: new Set(["ski"]),
      blockedEquipment: {},
      loading: false,
    });
    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Benötigte Ausrüstung für Ski" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Programm Ski bearbeiten" })).toBeDisabled();
  });

  it("locks the equipment link while a write on that program is in flight", async () => {
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
      expect(screen.getByRole("link", { name: "Benötigte Ausrüstung für Ski" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Benötigte Ausrüstung für Alternativ" }),
    ).not.toHaveAttribute("aria-disabled");
  });
});

describe("ProgramEquipmentView", () => {
  it("reads the program named in the URL", () => {
    render(<ProgramEquipmentView programId="ski" />);

    expect(useProgram).toHaveBeenCalledWith("ski");
  });

  it("lists the entries the program carries, and names the program", () => {
    render(<ProgramEquipmentView programId="ski" />);

    expect(screen.getByRole("heading", { name: /Ski/ })).toBeInTheDocument();
    expect(screen.getByText("Helm")).toBeInTheDocument();
    expect(screen.getByText("Stöcke")).toBeInTheDocument();
  });

  it("offers a way back to the programs list", () => {
    render(<ProgramEquipmentView programId="ski" />);

    expect(screen.getByRole("link", { name: /alle programme/i })).toHaveAttribute(
      "href",
      "/app/master-data/programs",
    );
  });

  it("renders a program with no equipment as an empty list rather than an error", () => {
    useProgram.mockReturnValue({
      program: { id: "alt", name: "Alternativ", requiredEquipment: [] },
      loading: false,
      error: null,
    });

    render(<ProgramEquipmentView programId="alt" />);

    expect(screen.getByText("Dieses Programm benötigt keine Ausrüstung.")).toBeInTheDocument();
  });

  it("appends a new entry rather than replacing the list", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView programId="ski" />);

    await userEvent.click(screen.getByRole("button", { name: /neuer ausrüstungsgegenstand/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Brille");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/master-data/programs/ski");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(fetchMock)).toEqual({ requiredEquipment: ["Helm", "Stöcke", "Brille"] });
  });

  it("renames an entry in place, keeping the order", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView programId="ski" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm bearbeiten" }),
    );
    const field = screen.getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.type(field, "Skihelm");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ requiredEquipment: ["Skihelm", "Stöcke"] });
  });

  it("removes an entry by rewriting the list without it", async () => {
    const fetchMock = stubFetch();
    render(<ProgramEquipmentView programId="ski" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ requiredEquipment: ["Stöcke"] });
  });

  it("disables an entry a student of an open season still rents", () => {
    useUsageReport.mockReturnValue({
      blockedIds: new Set<string>(),
      blockedEquipment: { ski: ["Helm"] },
      loading: false,
    });

    render(<ProgramEquipmentView programId="ski" />);

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
      blockedIds: new Set<string>(),
      blockedEquipment: { board: ["Helm"] },
      loading: false,
    });

    render(<ProgramEquipmentView programId="ski" />);

    expect(
      screen.getByRole("button", { name: "Ausrüstungsgegenstand Helm löschen" }),
    ).toBeEnabled();
  });
});
