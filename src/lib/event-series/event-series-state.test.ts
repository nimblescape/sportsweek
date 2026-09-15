/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EVENT_SERIES_STATE_LABELS,
  anyClassOpen,
  classIsOpen,
  eventSeriesState,
  visibleEventSeries,
} from "@/lib/event-series/event-series-state";

const flags = (overrides: Partial<Parameters<typeof eventSeriesState>[0]> = {}) => ({
  isArchived: false,
  classOptions: [],
  ...overrides,
});

const openClass = { name: "3aWI", teacherUids: [], isOpenToStudents: true };

describe("eventSeriesState", () => {
  it("reports an archived event series", () => {
    expect(eventSeriesState(flags({ isArchived: true }))).toBe("archived");
  });

  it("reports a series taking registrations as open", () => {
    expect(eventSeriesState(flags({ classOptions: [openClass] }))).toBe("open");
  });

  it("reports a series nobody can register in as closed", () => {
    expect(eventSeriesState(flags())).toBe("closed");
  });

  /** Archiving closes a series and takes away every screen the other state describes (US-19). */
  it("lets archived win, so a contradictory record resolves to one state", () => {
    expect(eventSeriesState(flags({ isArchived: true, classOptions: [openClass] }))).toBe(
      "archived",
    );
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

describe("anyClassOpen", () => {
  it("is false where the series has no classes", () => {
    expect(anyClassOpen([])).toBe(false);
  });

  it("is false where every class is closed", () => {
    expect(anyClassOpen([{ isOpenToStudents: false }, { isOpenToStudents: false }])).toBe(false);
  });

  it("is true where one class among several is open", () => {
    expect(anyClassOpen([{ isOpenToStudents: false }, { isOpenToStudents: true }])).toBe(true);
  });
});

describe("classIsOpen", () => {
  const classOptions = [
    { name: "3aWI", isOpenToStudents: true },
    { name: "3bWI", isOpenToStudents: false },
  ];

  it("is true for a class whose own entry is open", () => {
    expect(classIsOpen(classOptions, "3aWI")).toBe(true);
  });

  it("is false for a class whose own entry is closed", () => {
    expect(classIsOpen(classOptions, "3bWI")).toBe(false);
  });

  it("matches ignoring case and surrounding whitespace", () => {
    expect(classIsOpen(classOptions, " 3awi ")).toBe(true);
  });

  it("is false for null, since there is no class to ask about", () => {
    expect(classIsOpen(classOptions, null)).toBe(false);
  });

  it("is false for a name the series carries no such class under", () => {
    expect(classIsOpen(classOptions, "9zZZ")).toBe(false);
  });
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
