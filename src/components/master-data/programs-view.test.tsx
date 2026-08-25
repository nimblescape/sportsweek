/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useMasterData = vi.fn();
const useBlockedItemIds = vi.fn();

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (...args: unknown[]) => useMasterData(...args),
  useBlockedItemIds: (...args: unknown[]) => useBlockedItemIds(...args),
}));

const { ProgramsView } = await import("./programs-view");
const { ProgramEquipmentView } = await import("./program-equipment-view");

const programs = [
  { id: "ski", name: "Ski" },
  { id: "alt", name: "Alternativ" },
];

beforeEach(() => {
  vi.clearAllMocks();
  useMasterData.mockReturnValue({ items: programs, loading: false, error: null });
  useBlockedItemIds.mockReturnValue(new Set<string>());
});

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
    useBlockedItemIds.mockReturnValue(new Set(["ski"]));
    render(<ProgramsView />);

    expect(screen.getByRole("link", { name: "Benötigte Ausrüstung für Ski" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Programm Ski bearbeiten" })).toBeDisabled();
  });
});

describe("ProgramEquipmentView", () => {
  it("scopes the list to the program in the URL", () => {
    render(<ProgramEquipmentView programId="ski" />);

    expect(useMasterData).toHaveBeenCalledWith("required-equipment", "ski");
  });

  it("names the program it belongs to", () => {
    useMasterData.mockImplementation((key: string) =>
      key === "programs"
        ? { items: programs, loading: false, error: null }
        : { items: [{ id: "e1", name: "Helm" }], loading: false, error: null },
    );

    render(<ProgramEquipmentView programId="ski" />);

    expect(screen.getByRole("heading", { name: /Ski/ })).toBeInTheDocument();
    expect(screen.getByText("Helm")).toBeInTheDocument();
  });

  it("offers a way back to the programs list", () => {
    render(<ProgramEquipmentView programId="ski" />);

    expect(screen.getByRole("link", { name: /alle programme/i })).toHaveAttribute(
      "href",
      "/app/master-data/programs",
    );
  });

  it("renders a program with no equipment as an empty list rather than an error", () => {
    useMasterData.mockImplementation((key: string) =>
      key === "programs"
        ? { items: programs, loading: false, error: null }
        : { items: [], loading: false, error: null },
    );

    render(<ProgramEquipmentView programId="alt" />);

    expect(screen.getByText("Dieses Programm benötigt keine Ausrüstung.")).toBeInTheDocument();
  });
});
