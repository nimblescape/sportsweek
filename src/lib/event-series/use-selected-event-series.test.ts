/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

const useEventSeries = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({
  useEventSeries: () => useEventSeries(),
}));

const { useSelectedEventSeries } = await import("@/lib/event-series/use-selected-event-series");

function eventSeriesOf(id: string): EventSeries {
  return { id, ...storedEventSeries() };
}

function delivered(...allEventSeries: EventSeries[]) {
  return { eventSeries: allEventSeries, loading: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEventSeries.mockReturnValue({ eventSeries: [], loading: true, error: null });
});

describe("useSelectedEventSeries", () => {
  it("holds nothing while the subscription has not answered", () => {
    const { result } = renderHook(() => useSelectedEventSeries("s1"));

    expect(result.current).toEqual({ eventSeries: null, loading: true, error: null });
  });

  /** The header decides once, for every page, so a view is handed the id rather than finding it. */
  it("picks the event series the page names out of the ones on offer", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1"), eventSeriesOf("s2")));

    const { result } = renderHook(() => useSelectedEventSeries("s2"));

    expect(result.current.eventSeries?.id).toBe("s2");
  });

  /** Archived, deleted, or never there — the view locks rather than guessing at another. */
  it("holds nothing when the id names none of them", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1")));

    const { result } = renderHook(() => useSelectedEventSeries("gone"));

    expect(result.current.eventSeries).toBeNull();
  });

  /** A student's series comes from their registration, and they may hold none at all (US-23). */
  it("holds nothing when nothing is selected", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1")));

    const { result } = renderHook(() => useSelectedEventSeries(null));

    expect(result.current.eventSeries).toBeNull();
  });

  it("passes a failed subscription on rather than reporting nothing selected", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: "Kein Zugriff." });

    const { result } = renderHook(() => useSelectedEventSeries("s1"));

    expect(result.current.error).toBe("Kein Zugriff.");
  });
});
