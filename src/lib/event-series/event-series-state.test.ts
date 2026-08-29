/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EVENT_SERIES_STATE_LABELS,
  eventSeriesState,
  visibleEventSeries,
} from "@/lib/event-series/event-series-state";

const flags = (overrides: Partial<Parameters<typeof eventSeriesState>[0]> = {}) => ({
  isArchived: false,
  isOpenToStudents: false,
  ...overrides,
});

describe("eventSeriesState", () => {
  it("reports an archived event series", () => {
    expect(eventSeriesState(flags({ isArchived: true }))).toBe("archived");
  });

  it("reports a series taking registrations as open", () => {
    expect(eventSeriesState(flags({ isOpenToStudents: true }))).toBe("open");
  });

  it("reports a series nobody can register in as closed", () => {
    expect(eventSeriesState(flags())).toBe("closed");
  });

  /** Archiving closes a series and takes away every screen the other state describes (US-19). */
  it("lets archived win, so a contradictory record resolves to one state", () => {
    expect(eventSeriesState(flags({ isArchived: true, isOpenToStudents: true }))).toBe("archived");
  });
});

describe("EVENT_SERIES_STATE_LABELS", () => {
  it("labels every state in German", () => {
    expect(EVENT_SERIES_STATE_LABELS).toEqual({
      archived: "Archiviert",
      open: "Registrierung für Schüler:innen offen",
      closed: "Registrierung für Schüler:innen geschlossen",
    });
  });
});

const eventSeries = (id: string, isArchived = false) => ({
  id,
  name: `Eventreihe ${id}`,
  isArchived,
});

describe("visibleEventSeries", () => {
  it("hides archived event series from the default list", () => {
    const list = [eventSeries("a"), eventSeries("b", true)];

    expect(visibleEventSeries(list, false).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("brings archived event series back, so unarchiving stays reachable", () => {
    const list = [eventSeries("a"), eventSeries("b", true)];

    expect(visibleEventSeries(list, true).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
