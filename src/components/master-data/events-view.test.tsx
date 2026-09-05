/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    eventSeries: { id: "s1", name: "Wintersportwoche" },
    loading: false,
    error: null,
  }),
}));

const { EventsView } = await import("./events-view");

beforeEach(() => {
  vi.clearAllMocks();
  useMasterData.mockReturnValue({ items: ["Woche 1"], loading: false, error: null });
  useUsageReport.mockReturnValue({
    blockedNames: new Set<string>(),
    blockedEquipment: {},
    loading: false,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("EventsView", () => {
  /** An event now carries lists of its own (US-33), so it is opened by its name like a program. */
  it("opens an event on the first category it may override", () => {
    render(<EventsView eventSeriesId="s1" />);

    expect(screen.getByRole("link", { name: "Woche 1" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/events/programs?event=Woche%201",
    );
  });

  it("percent-encodes a name a URL would otherwise read as structure", () => {
    useMasterData.mockReturnValue({ items: ["Woche 1/2"], loading: false, error: null });

    render(<EventsView eventSeriesId="s1" />);

    expect(screen.getByRole("link", { name: "Woche 1/2" })).toHaveAttribute(
      "href",
      "/app/event-series/s1/events/programs?event=Woche%201%2F2",
    );
  });
});
