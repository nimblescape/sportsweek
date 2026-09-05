/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { event, storedEventSeries } from "@/test/event-series";
import { EQUIPMENT_LABELS, MASTER_DATA_CATEGORIES } from "./categories";
import {
  allEventSeriesReport,
  eventReport,
  eventSeriesReport,
  INHERITS_EVERYTHING,
  NOTHING_MAINTAINED,
  programReport,
  type ReportSection,
} from "./report-tree";

const titlesOf = (sections: readonly ReportSection[]) => sections.map((one) => one.title);
const sectionNamed = (parent: ReportSection, title: string) => {
  const found = parent.sections.find((one) => one.title === title);
  if (!found) throw new Error(`No section titled ${title}`);
  return found;
};

describe("programReport", () => {
  it("names the program and lists what it requires", () => {
    const report = programReport({
      name: "Ski",
      requiredEquipment: [
        { name: "Helm", isRentable: true },
        { name: "Hose", isRentable: false },
      ],
    });

    expect(report.title).toBe("Ski");
    expect(sectionNamed(report, EQUIPMENT_LABELS.title).entries).toEqual([
      "Helm (Leihausrüstung)",
      "Hose (Keine Leihausrüstung)",
    ]);
  });

  /** The report is read away from the screen, so it says which items the school lends. */
  it("says of every item whether it can be borrowed", () => {
    const report = programReport({
      name: "Ski",
      requiredEquipment: [{ name: "Helm", isRentable: true }],
    });

    expect(sectionNamed(report, EQUIPMENT_LABELS.title).entries[0]).toContain("Leihausrüstung");
  });

  it("says so where a program requires nothing", () => {
    const report = programReport({ name: "Alternativ", requiredEquipment: [] });

    expect(sectionNamed(report, EQUIPMENT_LABELS.title).entries).toEqual([EQUIPMENT_LABELS.empty]);
  });
});

describe("eventReport", () => {
  it("lists only the categories the event names of its own", () => {
    const report = eventReport(
      event("Woche 2", {
        seasonPassOptions: ["Arlberg"],
        programs: [{ name: "Snowboard", requiredEquipment: [] }],
      }),
    );

    expect(report.title).toBe("Woche 2");
    expect(titlesOf(report.sections)).toEqual(["Programme", "Zugangskarten"]);
  });

  /** An event that overrides nothing is not empty, it is inherited — which is worth saying. */
  it("says what an event that names nothing of its own does instead", () => {
    const report = eventReport(event("Woche 1"));

    expect(report.entries).toEqual([INHERITS_EVERYTHING]);
    expect(report.sections).toEqual([]);
  });

  it("goes on down into an event's own programs", () => {
    const report = eventReport(
      event("Woche 2", {
        programs: [{ name: "Snowboard", requiredEquipment: [{ name: "Board", isRentable: true }] }],
      }),
    );

    const snowboard = sectionNamed(sectionNamed(report, "Programme"), "Snowboard");
    expect(sectionNamed(snowboard, EQUIPMENT_LABELS.title).entries).toEqual([
      "Board (Leihausrüstung)",
    ]);
  });
});

describe("eventSeriesReport", () => {
  it("names the series and holds every category, in the menu's order", () => {
    const report = eventSeriesReport(storedEventSeries({ name: "Wintersportwoche" }));

    expect(report.title).toBe("Wintersportwoche");
    expect(titlesOf(report.sections)).toEqual(
      Object.values(MASTER_DATA_CATEGORIES).map((category) => category.labels.title),
    );
  });

  it("lists the entries of a category of bare names", () => {
    const report = eventSeriesReport(storedEventSeries({ classOptions: ["2aWI", "2bWI"] }));

    expect(sectionNamed(report, "Klassen").entries).toEqual(["2aWI", "2bWI"]);
  });

  /** A heading standing over nothing would read as a list that failed to load. */
  it("says so where a category has no entries", () => {
    const report = eventSeriesReport(storedEventSeries({ classOptions: [] }));

    expect(sectionNamed(report, "Klassen").entries).toEqual([NOTHING_MAINTAINED]);
  });

  it("goes on down through the events into their own lists", () => {
    const report = eventSeriesReport(
      storedEventSeries({ events: [event("Woche 2", { skillLevels: ["Profi"] })] }),
    );

    const woche2 = sectionNamed(sectionNamed(report, "Events"), "Woche 2");
    expect(sectionNamed(woche2, "Leistungsstufen").entries).toEqual(["Profi"]);
  });

  it("goes on down through the programs into their equipment", () => {
    const report = eventSeriesReport(
      storedEventSeries({
        programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
      }),
    );

    const ski = sectionNamed(sectionNamed(report, "Programme"), "Ski");
    expect(sectionNamed(ski, EQUIPMENT_LABELS.title).entries).toEqual(["Helm (Leihausrüstung)"]);
  });
});

describe("allEventSeriesReport", () => {
  it("reports every series the school keeps, in their own order", () => {
    const report = allEventSeriesReport([
      storedEventSeries({ name: "Wintersportwoche" }),
      storedEventSeries({ name: "Kulturwoche" }),
    ]);

    expect(titlesOf(report)).toEqual(["Wintersportwoche", "Kulturwoche"]);
  });
});
