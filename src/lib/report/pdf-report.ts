/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Content, DynamicContent, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  NO_ANSWER,
  NO_STUDENTS_HINT,
  type ReportField,
  type ReportFieldContext,
} from "./report-fields";
import { exportedAtLine, filterLine, REPORT_TITLE, type ReportProvenance } from "./report-export";
import { INCOMPLETE_REGISTRATION_HINT } from "@/lib/student-master-data/answer-labels";
import type { RosterStudent } from "@/lib/students/roster";

const PAGE_MARGIN = 40;
/** Top and bottom margins have to clear the header and the footer drawn outside them. */
const TOP_MARGIN = 76;
const BOTTOM_MARGIN = 48;
const DETAIL_INDENT = 16;

const MUTED = "#444444";

/**
 * The font the document embeds, named here beside the files it is made of so the two cannot
 * drift apart. It is embedded rather than left to the reader's own Helvetica, whose encoding
 * spells German but not every name a roster can hold.
 */
export const PDF_FONTS = {
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};
const [DEFAULT_FONT] = Object.keys(PDF_FONTS);

/** What the footer says about where a reader is, which is the one thing it cannot say twice. */
export const pageLabel = (currentPage: number, pageCount: number) =>
  `Seite ${currentPage} von ${pageCount}`;

export type ReportDocumentOptions = {
  context: ReportFieldContext;
  provenance: ReportProvenance;
  /** The HTL logo as a data URL, or null where it could not be loaded (US-17). */
  logo: string | null;
};

/** Repeated on every page by pdfmake, which is what puts the title on all of them (US-17). */
function header(logo: string | null): Content {
  const title: Content = { text: REPORT_TITLE, style: "title", margin: [0, 6, 0, 0] };
  const columns: Content[] = logo === null ? [title] : [{ image: logo, fit: [26, 26] }, title];

  return { columns, columnGap: 10, margin: [PAGE_MARGIN, 20, PAGE_MARGIN, 0] };
}

function footer(provenance: ReportProvenance): DynamicContent {
  const taken = [exportedAtLine(provenance.exportedAt)];
  if (provenance.filterName !== null) taken.push(filterLine(provenance.filterName));

  return (currentPage, pageCount) => ({
    margin: [PAGE_MARGIN, 12, PAGE_MARGIN, 0],
    columns: [
      { text: taken.join(" · "), style: "meta" },
      { text: pageLabel(currentPage, pageCount), style: "meta", alignment: "right" },
    ],
  });
}

function studentBlock(
  student: RosterStudent,
  fields: readonly ReportField[],
  context: ReportFieldContext,
): Content {
  const master: Content = {
    text: [
      { text: `${student.firstName} ${student.lastName}`, bold: true },
      { text: ` (${student.email})`, color: MUTED },
      ...(student.record.isIncomplete
        ? [{ text: `  ${INCOMPLETE_REGISTRATION_HINT}`, italics: true }]
        : []),
    ],
  };

  const details: Content[] = fields.map((field) => ({
    margin: [DETAIL_INDENT, 2, 0, 0],
    text: [
      { text: `${field.label}: `, color: MUTED },
      field.valueOf(student.record, context) ?? NO_ANSWER,
    ],
  }));

  // A name and the answers under it are one thing to read, so they are one thing to break (US-17).
  return { unbreakable: true, margin: [0, 0, 0, 8], stack: [master, ...details] };
}

/**
 * The report as a paginated document (US-17). It is a definition rather than a file so that what
 * it holds can be read back and asserted on; turning it into a PDF is pdfmake's business.
 */
export function reportDocument(
  students: readonly RosterStudent[],
  fields: readonly ReportField[],
  { context, provenance, logo }: ReportDocumentOptions,
): TDocumentDefinitions {
  const blocks = students.map((student) => studentBlock(student, fields, context));

  return {
    info: { title: REPORT_TITLE },
    pageSize: "A4",
    pageMargins: [PAGE_MARGIN, TOP_MARGIN, PAGE_MARGIN, BOTTOM_MARGIN],
    header: header(logo),
    footer: footer(provenance),
    content: blocks.length === 0 ? [{ text: NO_STUDENTS_HINT, style: "meta" }] : blocks,
    defaultStyle: { font: DEFAULT_FONT, fontSize: 10 },
    styles: {
      title: { fontSize: 14, bold: true },
      meta: { fontSize: 8, color: MUTED },
    },
  };
}
