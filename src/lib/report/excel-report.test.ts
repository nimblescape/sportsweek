/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { OVERVIEW_SHEET, REPORT_SHEET, reportTable, reportWorkbook } from "./excel-report";
import type { ReportProvenance } from "./report-export";
import { reportFieldsOf } from "./report-fields";
import { rosterStudent } from "@/test/roster-student";

const ANNA = rosterStudent({ id: "r1", firstName: "Anna", lastName: "Muster" });
const BENE = rosterStudent({
  id: "r2",
  firstName: "Bene",
  lastName: "Berger",
  email: "bene@student.htldornbirn.at",
  class: "5BHIF",
});

const context = { eventNames: new Map([["event1", "Woche 1"]]) };
const PROVENANCE: ReportProvenance = {
  reportName: null,
  exportedAt: new Date(2026, 7, 27, 14, 35),
};

const table = (students = [ANNA, BENE], fields = reportFieldsOf([])) =>
  reportTable(students, fields, context);

const workbook = (students = [ANNA], fields = reportFieldsOf([]), provenance = PROVENANCE) =>
  reportWorkbook(students, fields, { context, provenance, logo: null });

describe("reportTable", () => {
  it("names the three the master line always shows as the leftmost columns", () => {
    expect(table().header).toEqual(["Vorname", "Nachname", "E-Mail"]);
  });

  it("is one row per student, in the order it was handed them", () => {
    expect(table().rows).toEqual([
      ["Anna", "Muster", "anna@student.htldornbirn.at"],
      ["Bene", "Berger", "bene@student.htldornbirn.at"],
    ]);
  });

  it("adds one column per activated field, after the three that are always there", () => {
    const { header, rows } = table([BENE], reportFieldsOf(["class", "gender"]));

    expect(header).toEqual(["Vorname", "Nachname", "E-Mail", "Klasse", "Geschlecht"]);
    expect(rows[0].slice(3)).toEqual(["5BHIF", "Weiblich"]);
  });

  it("spreads a tag standing for a group into a column per field", () => {
    const { header } = table([ANNA], reportFieldsOf(["measurements"]));

    expect(header.slice(3)).toEqual(["Gewicht [kg]", "Körpergröße [cm]", "Schuhgröße"]);
  });

  it("leaves an unanswered field empty, which is what a spreadsheet counts as missing", () => {
    const { header, rows } = table([ANNA], reportFieldsOf(["health"]));

    expect(header[3]).toBe("Krankheiten oder Allergien");
    expect(rows[0][3]).toBeNull();
  });

  it("gives the incomplete mark no column of its own until it is activated as a field", () => {
    expect(table([ANNA]).header).not.toContain("Registrierung");
    expect(table([ANNA], reportFieldsOf(["completeness"])).header).toContain("Registrierung");
  });
});

describe("reportWorkbook", () => {
  it("has an overview sheet and a report sheet, in that order", () => {
    expect(workbook().worksheets.map((sheet) => sheet.name)).toEqual([
      OVERVIEW_SHEET,
      REPORT_SHEET,
    ]);
  });

  it("says on the overview what the export is and when it was taken", () => {
    const overview = workbook().getWorksheet(OVERVIEW_SHEET);

    expect(overview?.getCell("A6").value).toBe("Sportsweek Report");
    expect(overview?.getCell("A7").value).toBe("Erstellt am 27.08.2026, 14:35");
  });

  it("names the saved filter on the overview, and names none where there is none", () => {
    const named = workbook([ANNA], reportFieldsOf([]), {
      reportName: "Nur 5BHIF",
      exportedAt: PROVENANCE.exportedAt,
    });

    expect(named.getWorksheet(OVERVIEW_SHEET)?.getCell("A8").value).toBe("Bericht: Nur 5BHIF");
    expect(workbook().getWorksheet(OVERVIEW_SHEET)?.getCell("A8").value).toBeNull();
  });

  it("carries the logo on the overview sheet when it was loaded", () => {
    const withLogo = reportWorkbook([ANNA], reportFieldsOf([]), {
      context,
      provenance: PROVENANCE,
      logo: "AAA",
    });

    expect(withLogo.getWorksheet(OVERVIEW_SHEET)?.getImages()).toHaveLength(1);
    expect(workbook().getWorksheet(OVERVIEW_SHEET)?.getImages()).toHaveLength(0);
  });

  it("starts the report sheet with the header row, with nothing above it", () => {
    const report = workbook([ANNA, BENE], reportFieldsOf(["class"])).getWorksheet(REPORT_SHEET);

    expect(report?.getRow(1).values).toEqual([
      undefined,
      "Vorname",
      "Nachname",
      "E-Mail",
      "Klasse",
    ]);
    expect(report?.getRow(2).getCell(1).value).toBe("Anna");
  });
});
