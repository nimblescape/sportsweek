/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import ExcelJS from "exceljs";
import type { ReportField, ReportFieldContext } from "./report-fields";
import { exportedAtLine, reportLine, REPORT_TITLE, type ReportProvenance } from "./report-export";
import type { RosterStudent } from "@/lib/students/roster";

/** One says what the export is, the other holds the students (US-18). */
export const OVERVIEW_SHEET = "Overview";
export const REPORT_SHEET = "Report";

/** The three the report's master line always shows, each a column of its own here. */
const IDENTITY_COLUMNS: readonly { label: string; valueOf: (of: RosterStudent) => string }[] = [
  { label: "Vorname", valueOf: (student) => student.firstName },
  { label: "Nachname", valueOf: (student) => student.lastName },
  { label: "E-Mail", valueOf: (student) => student.email },
];

const TITLE_ROW = 6;
const LOGO_SIZE = { width: 68, height: 80 };

/** Null is an unanswered field, which a spreadsheet says with an empty cell rather than a word. */
export type ReportTable = {
  header: readonly string[];
  rows: readonly (readonly (string | null)[])[];
};

/**
 * The report as a table (US-18). A field standing for a group has already been flattened by
 * `reportFieldsOf`, so a group tag arrives here as the several fields it stands for and gets a
 * column each — a cell holding all of them could be read but not sorted.
 */
export function reportTable(
  students: readonly RosterStudent[],
  fields: readonly ReportField[],
  context: ReportFieldContext,
): ReportTable {
  return {
    header: [...IDENTITY_COLUMNS.map((column) => column.label), ...fields.map((it) => it.label)],
    rows: students.map((student) => [
      ...IDENTITY_COLUMNS.map((column) => column.valueOf(student)),
      ...fields.map((field) => field.valueOf(student.record, context)),
    ]),
  };
}

/** What the overview sheet says under the logo — the same wording the PDF's footer uses. */
export function overviewLines({ reportName, exportedAt }: ReportProvenance): string[] {
  return [
    REPORT_TITLE,
    exportedAtLine(exportedAt),
    ...(reportName === null ? [] : [reportLine(reportName)]),
  ];
}

export type ReportWorkbookOptions = {
  context: ReportFieldContext;
  provenance: ReportProvenance;
  /** The HTL logo as base64-encoded PNG; xlsx takes a bitmap and nothing else (US-18). */
  logo: string | null;
};

export function reportWorkbook(
  students: readonly RosterStudent[],
  fields: readonly ReportField[],
  { context, provenance, logo }: ReportWorkbookOptions,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const overview = workbook.addWorksheet(OVERVIEW_SHEET);
  const report = workbook.addWorksheet(REPORT_SHEET);

  if (logo !== null) {
    const image = workbook.addImage({ base64: logo, extension: "png" });
    overview.addImage(image, { tl: { col: 0, row: 0 }, ext: LOGO_SIZE });
  }

  overview.getColumn(1).width = 48;
  overviewLines(provenance).forEach((line, index) => {
    overview.getCell(TITLE_ROW + index, 1).value = line;
  });
  overview.getCell(TITLE_ROW, 1).font = { bold: true, size: 14 };

  const table = reportTable(students, fields, context);
  report.addRow([...table.header]).font = { bold: true };
  for (const row of table.rows) report.addRow([...row]);
  report.columns.forEach((column) => {
    column.width = 22;
  });

  return workbook;
}
