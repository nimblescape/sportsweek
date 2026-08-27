/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { INCOMPLETE_REGISTRATION_HINT, NO_ANSWER, type ReportField } from "./report-fields";
import type { RosterStudent } from "@/lib/students/roster";

/** What a teacher is told when the browser refuses to open the print window (US-13). */
export const POPUP_BLOCKED_HINT =
  "Das Druckfenster wurde blockiert. Bitte erlaube Pop-ups für diese Seite und versuche es erneut.";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Everything below is a student's own text going into markup, so nothing reaches the document
 * unescaped — a name is a name even when it is spelled like a tag.
 */
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ESCAPES[character]);

const PRINT_STYLES = `
  @page { margin: 16mm; }
  body { margin: 0; color: #000; background: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 11pt; }
  h1 { font-size: 14pt; margin: 0 0 12pt; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* A student is one block: their detail lines never start on a page their name is not on. */
  li { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8pt; }
  .name { margin: 0; font-weight: 600; }
  .email { font-weight: 400; }
  .incomplete { font-weight: 400; font-style: italic; }
  dl { margin: 2pt 0 0 8mm; }
  dl > div { display: flex; gap: 6pt; }
  dt { color: #444; }
  dd { margin: 0; }
`;

function detailLines(student: RosterStudent, fields: readonly ReportField[]): string {
  if (fields.length === 0) return "";

  const rows = fields
    .map((field) => {
      const value = field.valueOf(student.record) ?? NO_ANSWER;
      return `<div><dt>${escape(field.label)}:</dt><dd>${escape(value)}</dd></div>`;
    })
    .join("");

  return `<dl>${rows}</dl>`;
}

function studentBlock(student: RosterStudent, fields: readonly ReportField[]): string {
  const name = escape(`${student.firstName} ${student.lastName}`);
  const email = `<span class="email">(${escape(student.email)})</span>`;
  const incomplete = student.record.isIncomplete
    ? ` <span class="incomplete">${INCOMPLETE_REGISTRATION_HINT}</span>`
    : "";

  return `<li><p class="name">${name} ${email}${incomplete}</p>${detailLines(student, fields)}</li>`;
}

/**
 * The report as a standalone document for the print window (US-13). It keeps the master-detail
 * shape of the screen and drops everything that only makes sense there: no navigation, no
 * controls, black on white.
 *
 * It is built as a string and written into the window rather than fetched through a URL,
 * because the alternative would put a class full of people's contact details in a query string
 * — in the address bar, the history, and any log that records one.
 */
export function printableReportHtml(
  students: readonly RosterStudent[],
  fields: readonly ReportField[],
  { heading }: { heading: string },
): string {
  const body = students.map((student) => studentBlock(student, fields)).join("");

  return [
    "<!doctype html>",
    '<html lang="de">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escape(heading)}</title>`,
    `<style>${PRINT_STYLES}</style>`,
    "</head>",
    "<body>",
    `<h1>${escape(heading)}</h1>`,
    `<ul>${body}</ul>`,
    "</body>",
    "</html>",
  ].join("");
}
