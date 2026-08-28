/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  activeEventSeriesOf,
  EVENT_SERIES_STATE_LABELS,
  eventSeriesState,
  visibleEventSeries,
} from "@/lib/event-series/event-series-state";

describe("eventSeriesState", () => {
  it("reports an active event series", () => {
    expect(eventSeriesState({ isActive: true, isArchived: false })).toBe("active");
  });

  it("reports an archived event series", () => {
    expect(eventSeriesState({ isActive: false, isArchived: true })).toBe("archived");
  });

  it("reports an event series that is neither active nor archived as inactive", () => {
    expect(eventSeriesState({ isActive: false, isArchived: false })).toBe("inactive");
  });

  it("lets archived win, so a contradictory record still resolves to one state", () => {
    expect(eventSeriesState({ isActive: true, isArchived: true })).toBe("archived");
  });
});

describe("EVENT_SERIES_STATE_LABELS", () => {
  it("labels every state in German", () => {
    expect(EVENT_SERIES_STATE_LABELS).toEqual({
      active: "Aktiv",
      archived: "Archiviert",
      inactive: "Inaktiv",
    });
  });
});

const eventSeries = (
  id: string,
  overrides: Partial<{ isActive: boolean; isArchived: boolean }> = {},
) => ({
  id,
  name: `Eventreihe ${id}`,
  isActive: false,
  isArchived: false,
  ...overrides,
});

describe("visibleEventSeries", () => {
  it("hides archived event series from the default list", () => {
    const list = [eventSeries("a"), eventSeries("b", { isArchived: true })];

    expect(visibleEventSeries(list, false).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("brings archived event series back, so unarchiving stays reachable", () => {
    const list = [eventSeries("a"), eventSeries("b", { isArchived: true })];

    expect(visibleEventSeries(list, true).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps the active event series visible", () => {
    const list = [eventSeries("a", { isActive: true })];

    expect(visibleEventSeries(list, false)).toHaveLength(1);
  });
});

describe("activeEventSeriesOf", () => {
  it("returns the single active event series", () => {
    const list = [eventSeries("a"), eventSeries("b", { isActive: true })];

    expect(activeEventSeriesOf(list)?.id).toBe("b");
  });

  it("reports no active event series, which is a state a teacher can deliberately create", () => {
    expect(activeEventSeriesOf([eventSeries("a")])).toBeNull();
  });

  it("reports no active event series for an empty list", () => {
    expect(activeEventSeriesOf([])).toBeNull();
  });

  it("fails loudly when more than one event series is active", () => {
    const list = [eventSeries("a", { isActive: true }), eventSeries("b", { isActive: true })];

    expect(() => activeEventSeriesOf(list)).toThrow(/nur eine/i);
  });
});
