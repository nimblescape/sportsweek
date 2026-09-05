/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { EQUIPMENT_LABELS, MASTER_DATA_CATEGORIES } from "./categories";
import {
  categoryTabs,
  equipmentPath,
  equipmentTabs,
  eventSeriesRecordPath,
  eventSeriesTrail,
  masterDataPath,
  programTrail,
  ROOT_TABS,
  rootTrail,
} from "./hierarchy";

describe("masterDataPath", () => {
  it("puts the category under the series it belongs to, with no master data segment left", () => {
    expect(masterDataPath("s1", "classes")).toBe("/app/event-series/s1/classes");
  });

  /** An id is opaque and never typed, but a path segment it corrupted would be silent. */
  it("encodes the event series id", () => {
    expect(masterDataPath("a/b", "programs")).toBe("/app/event-series/a%2Fb/programs");
  });
});

describe("eventSeriesRecordPath", () => {
  /** The record has no view of its own, so it opens on the first of its child collections. */
  it("opens a series on the first category of the menu", () => {
    const [first] = Object.keys(MASTER_DATA_CATEGORIES);

    expect(eventSeriesRecordPath("s1")).toBe(masterDataPath("s1", "classes"));
    expect(eventSeriesRecordPath("s1")).toBe(`/app/event-series/s1/${first}`);
  });
});

describe("equipmentPath", () => {
  /**
   * A program is identified by its name (US-21), which a teacher typed and which may hold a
   * slash — so it is named in a search parameter rather than in a path segment.
   */
  it("names the program in a search parameter", () => {
    expect(equipmentPath("s1", "Ski")).toBe("/app/event-series/s1/programs?equipment=Ski");
  });

  it("encodes a name a path could not carry, and the plus a query would read as a space", () => {
    expect(equipmentPath("s1", "Ski/Board")).toBe(
      "/app/event-series/s1/programs?equipment=Ski%2FBoard",
    );
    expect(equipmentPath("s1", "Ski+Board")).toBe(
      "/app/event-series/s1/programs?equipment=Ski%2BBoard",
    );
  });
});

describe("the tabs of a record", () => {
  it("offers the root its one child collection", () => {
    expect(ROOT_TABS.map((tab) => tab.label)).toEqual(["Eventreihen"]);
    expect(ROOT_TABS[0].href).toBe("/app/event-series");
  });

  it("offers a series every category, in the menu's order", () => {
    expect(categoryTabs("s1").map((tab) => tab.label)).toEqual([
      "Klassen",
      "Events",
      "Programme",
      "Leistungsstufen",
      "Zugangskarten",
      "Zustiegsstellen",
      "Verpflegung",
    ]);
  });

  it("links every category beneath the series it belongs to", () => {
    for (const [key, category] of Object.entries(MASTER_DATA_CATEGORIES)) {
      expect(categoryTabs("s1")).toContainEqual({
        key,
        label: category.labels.title,
        href: `/app/event-series/s1/${key}`,
        addLabel: category.labels.add,
      });
    }
  });

  /** The control's accessible name is the category's own wording, not one shared word. */
  it("names each add control after the category that carries it", () => {
    const addLabels = categoryTabs("s1").map((tab) => tab.addLabel);

    expect(addLabels).toContain("Neue Klasse");
    expect(addLabels).toContain("Neues Event");
    expect(new Set(addLabels).size).toBe(addLabels.length);
  });

  /** Equipment belongs to the program that requires it, so the leaf has one tag as the root does. */
  it("offers a program its one child collection", () => {
    const tabs = equipmentTabs("s1", "Ski");

    expect(tabs.map((tab) => tab.label)).toEqual([EQUIPMENT_LABELS.title]);
    expect(tabs[0].addLabel).toBe(EQUIPMENT_LABELS.add);
    expect(tabs[0].href).toBe(equipmentPath("s1", "Ski"));
  });
});

describe("the breadcrumb trails", () => {
  /** The navigation already says the teacher is in Stammdaten, so the trail does not repeat it. */
  it("starts at the event series collection rather than at the root", () => {
    expect(rootTrail()).toEqual([{ label: "Eventreihen", href: "/app/event-series" }]);
  });

  it("names the whole path down to a series' record", () => {
    expect(eventSeriesTrail("s1", "Wintersportwoche")).toEqual([
      { label: "Eventreihen", href: "/app/event-series" },
      { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
    ]);
  });

  it("names the whole path down to a program", () => {
    expect(programTrail("s1", "Wintersportwoche", "Ski")).toEqual([
      { label: "Eventreihen", href: "/app/event-series" },
      { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
      { label: "Programme", href: "/app/event-series/s1/programs" },
      { label: "Ski", href: "/app/event-series/s1/programs?equipment=Ski" },
    ]);
  });

  /** The title repeats the last step, so the trail is the full address of the page. */
  it("ends at the record the page is about", () => {
    expect(eventSeriesTrail("s1", "Wintersportwoche").at(-1)?.label).toBe("Wintersportwoche");
    expect(programTrail("s1", "Wintersportwoche", "Ski").at(-1)?.label).toBe("Ski");
  });
});
