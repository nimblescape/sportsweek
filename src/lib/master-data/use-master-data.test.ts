/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { event, storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

const useEventSeries = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({
  useEventSeries: () => useEventSeries(),
}));

const { useMasterData, useProgram, usePrograms, useUsageReport } =
  await import("@/lib/master-data/use-master-data");

function eventSeriesOf(
  id: string,
  overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {},
): EventSeries {
  return { id, ...storedEventSeries(overrides) };
}

/** What the one subscription carrying every list looks like once it has answered (US-21). */
function delivered(...allEventSeries: EventSeries[]) {
  return { eventSeries: allEventSeries, loading: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEventSeries.mockReturnValue({ eventSeries: [], loading: true, error: null });
});

describe("useMasterData", () => {
  it("reads the list its category names off the event series document", () => {
    useEventSeries.mockReturnValue(
      delivered(eventSeriesOf("s1", { skillLevels: ["Anfänger", "Profi"] })),
    );

    const { result } = renderHook(() => useMasterData("skill-levels", "s1"));

    expect(result.current.items).toEqual(["Anfänger", "Profi"]);
  });

  it("reduces a program to its name, since that is what the list shows", () => {
    useEventSeries.mockReturnValue(
      delivered(
        eventSeriesOf("s1", {
          programs: [{ name: "Ski", requiredEquipment: ["Helm"] }],
        }),
      ),
    );

    const { result } = renderHook(() => useMasterData("programs", "s1"));

    expect(result.current.items).toEqual(["Ski"]);
  });

  it("keeps the order the teacher dropped the items into, not an alphabetical one", () => {
    useEventSeries.mockReturnValue(
      delivered(eventSeriesOf("s1", { classOptions: ["Zoe", "Anton", "Mia"] })),
    );

    const { result } = renderHook(() => useMasterData("classes", "s1"));

    expect(result.current.items).toEqual(["Zoe", "Anton", "Mia"]);
  });

  /**
   * One document carries all six lists, so a view can tell an empty list from one still on its
   * way — which is what lets an empty list mean a question nobody was asked (US-21).
   */
  it("says it is still loading rather than reporting an empty list", () => {
    const { result } = renderHook(() => useMasterData("classes", "s1"));

    expect(result.current).toEqual({ items: [], loading: true, error: null });
  });

  it("reports an empty list once the event series has arrived", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1")));

    const { result } = renderHook(() => useMasterData("food-options", "s1"));

    expect(result.current).toEqual({ items: [], loading: false, error: null });
  });

  it("holds an empty list while the id names no event series, since none supplies one", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1", { classOptions: ["3AHIT"] })));

    const { result } = renderHook(() => useMasterData("classes", "gone"));

    expect(result.current.items).toEqual([]);
  });

  /** An event's own list stands in for the series' entirely, once it names one (US-33). */
  it("reads an event's own list instead of the series', when named", () => {
    useEventSeries.mockReturnValue(
      delivered(
        eventSeriesOf("s1", {
          skillLevels: ["Anfänger"],
          events: [event("Woche 1", { skillLevels: ["Fortgeschritten"] })],
        }),
      ),
    );

    const { result } = renderHook(() => useMasterData("skill-levels", "s1", "Woche 1"));

    expect(result.current.items).toEqual(["Fortgeschritten"]);
  });

  /** Empty means the event inherits the series' list; this hook reports the raw state as it is. */
  it("reports an event's own empty list as empty, not resolved to the series'", () => {
    useEventSeries.mockReturnValue(
      delivered(eventSeriesOf("s1", { skillLevels: ["Anfänger"], events: [event("Woche 1")] })),
    );

    const { result } = renderHook(() => useMasterData("skill-levels", "s1", "Woche 1"));

    expect(result.current.items).toEqual([]);
  });

  it("holds an empty list for an event name the series does not carry", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1", { events: [event("Woche 1")] })));

    const { result } = renderHook(() => useMasterData("skill-levels", "s1", "Ghost"));

    expect(result.current.items).toEqual([]);
  });
});

describe("usePrograms", () => {
  it("keeps the equipment list a name alone would drop, since students rent from it", () => {
    useEventSeries.mockReturnValue(
      delivered(
        eventSeriesOf("s1", {
          programs: [{ name: "Ski", requiredEquipment: ["Helm", "Stöcke"] }],
        }),
      ),
    );

    const { result } = renderHook(() => usePrograms("s1"));

    expect(result.current.programs).toEqual([
      { name: "Ski", requiredEquipment: ["Helm", "Stöcke"] },
    ]);
  });

  it("holds no program while the id names no event series", () => {
    useEventSeries.mockReturnValue(delivered(eventSeriesOf("s1")));

    const { result } = renderHook(() => usePrograms("gone"));

    expect(result.current.programs).toEqual([]);
  });
});

describe("useProgram", () => {
  const withPrograms = () =>
    delivered(
      eventSeriesOf("s1", {
        programs: [
          { name: "Ski", requiredEquipment: ["Helm"] },
          { name: "Snowboard", requiredEquipment: [] },
        ],
      }),
    );

  it("finds the program the view named", () => {
    useEventSeries.mockReturnValue(withPrograms());

    const { result } = renderHook(() => useProgram("Ski", "s1"));

    expect(result.current.program).toEqual({ name: "Ski", requiredEquipment: ["Helm"] });
  });

  /** A name that names nothing is the honest answer to a program since renamed or removed. */
  it("holds nothing for a name the list no longer carries", () => {
    useEventSeries.mockReturnValue(withPrograms());

    const { result } = renderHook(() => useProgram("Langlauf", "s1"));

    expect(result.current.program).toBeNull();
  });
});

describe("useUsageReport", () => {
  afterEach(() => vi.unstubAllGlobals());

  const nothingBlocked = { blockedNames: new Set(), blockedEquipment: {}, loading: false };

  function stubFetch(implementation: (...args: unknown[]) => unknown) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function respond(body: unknown) {
    return () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
  }

  it("asks the handler for the category it was given, beneath its event series", async () => {
    const fetchMock = stubFetch(respond({ blockedNames: [], blockedEquipment: {} }));

    renderHook(() => useUsageReport("food-options", "s1"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/event-series/s1/master-data/food-options"),
    );
  });

  /** An event's own page asks its own route, the event named in the query (US-33). */
  it("asks the event-scoped handler when an event name is given", async () => {
    const fetchMock = stubFetch(respond({ blockedNames: [], blockedEquipment: {} }));

    renderHook(() => useUsageReport("skill-levels", "s1", "Woche 1"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s1/events/master-data/skill-levels?event=Woche%201",
      ),
    );
  });

  it("reports itself unanswered until the handler replies, so nothing is offered and taken back", () => {
    stubFetch(respond({ blockedNames: [], blockedEquipment: {} }));

    const { result } = renderHook(() => useUsageReport("classes", "s1"));

    expect(result.current.loading).toBe(true);
  });

  it("keeps what is in use apart from the entries an item's own list holds", async () => {
    stubFetch(respond({ blockedNames: ["Ski"], blockedEquipment: { Snowboard: ["Helm"] } }));

    const { result } = renderHook(() => useUsageReport("programs", "s1"));

    await waitFor(() =>
      expect(result.current).toEqual({
        blockedNames: new Set(["Ski"]),
        blockedEquipment: { Snowboard: ["Helm"] },
        loading: false,
      }),
    );
  });

  it("blocks nothing when the handler refuses, since the server re-checks every write", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 403 })));

    const { result } = renderHook(() => useUsageReport("classes", "s1"));

    await waitFor(() => expect(result.current).toEqual(nothingBlocked));
  });

  it("does not leave the list locked when the request fails, since the server re-checks anyway", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Promise.reject(new Error("offline")));

    const { result } = renderHook(() => useUsageReport("classes", "s1"));

    await waitFor(() => expect(result.current).toEqual(nothingBlocked));
  });
});
