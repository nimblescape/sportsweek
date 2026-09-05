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
  eventCategoryPath,
  eventEquipmentPath,
  eventEquipmentTabs,
  eventEquipmentTrail,
  eventRecordPath,
  eventSeriesRecordPath,
  eventSeriesTrail,
  eventTabs,
  eventTrail,
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

describe("eventRecordPath", () => {
  /** An event has no view of its own either, so it opens on the first category it may override. */
  it("opens an event on the first overridable category", () => {
    expect(eventRecordPath("s1", "Woche 1")).toBe(eventCategoryPath("s1", "Woche 1", "programs"));
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

describe("eventCategoryPath", () => {
  /** `events` is static because it is the one category whose entries have children of their own. */
  it("puts the category under a static events segment, the event named in a search parameter", () => {
    expect(eventCategoryPath("s1", "Woche 1", "programs")).toBe(
      "/app/event-series/s1/events/programs?event=Woche%201",
    );
  });

  it("encodes a name a path could not carry, and the plus a query would read as a space", () => {
    expect(eventCategoryPath("s1", "Woche 1/2", "programs")).toBe(
      "/app/event-series/s1/events/programs?event=Woche%201%2F2",
    );
    expect(eventCategoryPath("s1", "Woche 1+2", "programs")).toBe(
      "/app/event-series/s1/events/programs?event=Woche%201%2B2",
    );
  });
});

describe("eventEquipmentPath", () => {
  it("names the event's own program in a search parameter, beside the event's", () => {
    expect(eventEquipmentPath("s1", "Woche 1", "Ski")).toBe(
      "/app/event-series/s1/events/programs?event=Woche%201&equipment=Ski",
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
        opensRecords: category.opensRecords,
      });
    }
  });

  /** A collection whose entries are records is a step of the path; a list of names is a leaf. */
  it("says which categories open records of their own", () => {
    const opening = categoryTabs("s1")
      .filter((tab) => tab.opensRecords)
      .map((tab) => tab.key);

    expect(opening).toEqual(["events", "programs"]);
    expect(ROOT_TABS[0].opensRecords).toBe(true);
    expect(equipmentTabs("s1", "Ski")[0].opensRecords).toBe(false);
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

  /** An event's row offers only the five categories it may override, not classes or events. */
  it("offers an event only the categories it may override, in the menu's order", () => {
    expect(eventTabs("s1", "Woche 1").map((tab) => tab.label)).toEqual([
      "Programme",
      "Leistungsstufen",
      "Zugangskarten",
      "Zustiegsstellen",
      "Verpflegung",
    ]);
  });

  it("links every one of an event's categories beneath that event", () => {
    expect(eventTabs("s1", "Woche 1")).toContainEqual({
      key: "programs",
      label: "Programme",
      href: eventCategoryPath("s1", "Woche 1", "programs"),
      addLabel: "Neues Programm",
      opensRecords: true,
    });
  });

  it("offers an event's own program its one child collection", () => {
    const tabs = eventEquipmentTabs("s1", "Woche 1", "Ski");

    expect(tabs.map((tab) => tab.label)).toEqual([EQUIPMENT_LABELS.title]);
    expect(tabs[0].addLabel).toBe(EQUIPMENT_LABELS.add);
    expect(tabs[0].href).toBe(eventEquipmentPath("s1", "Woche 1", "Ski"));
  });
});

describe("the breadcrumb trails", () => {
  /** The screen ends the path with the collection on show, so a trail names ancestors only. */
  it("gives the root no ancestors, its whole path being the collection it lists", () => {
    expect(rootTrail()).toEqual([]);
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

  /** The screen's own last step follows it, so the record is a step the teacher can go back to. */
  it("ends at the record the collection on show belongs to", () => {
    expect(eventSeriesTrail("s1", "Wintersportwoche").at(-1)?.label).toBe("Wintersportwoche");
    expect(programTrail("s1", "Wintersportwoche", "Ski").at(-1)?.label).toBe("Ski");
  });

  /** An event is a step of the path now that it carries lists of its own (US-33). */
  it("names the whole path down to an event's record", () => {
    expect(eventTrail("s1", "Wintersportwoche", "Woche 2")).toEqual([
      { label: "Eventreihen", href: "/app/event-series" },
      { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
      { label: "Events", href: "/app/event-series/s1/events" },
      { label: "Woche 2", href: eventRecordPath("s1", "Woche 2") },
    ]);
    expect(eventTrail("s1", "Wintersportwoche", "Woche 2").at(-1)?.label).toBe("Woche 2");
  });

  it("names the whole path down to one of an event's own programs", () => {
    expect(eventEquipmentTrail("s1", "Wintersportwoche", "Woche 2", "Ski")).toEqual([
      { label: "Eventreihen", href: "/app/event-series" },
      { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
      { label: "Events", href: "/app/event-series/s1/events" },
      { label: "Woche 2", href: eventRecordPath("s1", "Woche 2") },
      { label: "Programme", href: eventCategoryPath("s1", "Woche 2", "programs") },
      { label: "Ski", href: eventEquipmentPath("s1", "Woche 2", "Ski") },
    ]);
    expect(eventEquipmentTrail("s1", "Wintersportwoche", "Woche 2", "Ski").at(-1)?.label).toBe(
      "Ski",
    );
  });
});
