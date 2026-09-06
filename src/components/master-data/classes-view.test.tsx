/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storedEventSeries } from "@/test/event-series";
import { render, screen } from "@testing-library/react";

const useMasterData = vi.fn();
const useUsageReport = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (...args: unknown[]) => useMasterData(...args),
  useUsageReport: (...args: unknown[]) => useUsageReport(...args),
}));

// The screen names the record it is about, which reaches Firebase no test here has cause to start.
vi.mock("@/lib/event-series/use-selected-event-series", () => ({
  useSelectedEventSeries: () => ({
    eventSeries: { id: "s1", ...storedEventSeries({ name: "Wintersportwoche" }) },
    loading: false,
    error: null,
  }),
}));

const { ClassesView } = await import("./classes-view");

beforeEach(() => {
  vi.clearAllMocks();
  useMasterData.mockReturnValue({ items: ["2aWI"], loading: false, error: null });
  useUsageReport.mockReturnValue({
    blockedNames: new Set<string>(),
    blockedEquipment: {},
    loading: false,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ClassesView", () => {
  /** A class now has a record of its own, the teachers assigned to it (US-38). */
  it("opens a class on its teachers", () => {
    render(<ClassesView eventSeriesId="s1" />);

    expect(screen.getByRole("link", { name: "2aWI" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/classes?teachers=2aWI",
    );
  });

  it("percent-encodes a name a URL would otherwise read as structure", () => {
    useMasterData.mockReturnValue({ items: ["2aWI/2"], loading: false, error: null });

    render(<ClassesView eventSeriesId="s1" />);

    expect(screen.getByRole("link", { name: "2aWI/2" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/classes?teachers=2aWI%2F2",
    );
  });
});
