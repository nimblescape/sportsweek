/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/** What both exports call themselves, and what names one that no saved filter names (US-17). */
export const REPORT_TITLE = "Sportsweek Report";

/**
 * What a copy of the report says about itself once it has left the screen (US-17, US-18): when
 * it was taken, and which slice of the season it holds.
 */
export type ReportProvenance = {
  /** The saved filter the shown selection matches, or null where it matches none. */
  filterName: string | null;
  exportedAt: Date;
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** Spelled out rather than left to a locale, so a copy reads the same wherever it was made. */
export function germanDateTime(at: Date): string {
  const date = `${twoDigits(at.getDate())}.${twoDigits(at.getMonth() + 1)}.${at.getFullYear()}`;
  return `${date}, ${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
}

/** One wording for the PDF's footer and the workbook's overview sheet alike. */
export const exportedAtLine = (at: Date) => `Erstellt am ${germanDateTime(at)}`;
export const filterLine = (name: string) => `Filter: ${name}`;

/** Year first, so a folder of exports sorts into the order they were taken in (US-17). */
function fileStamp(at: Date): string {
  const date = `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}`;
  return `${date} ${twoDigits(at.getHours())}-${twoDigits(at.getMinutes())}`;
}

// A saved filter's name is text a teacher typed, and a path separator in it is not part of a name.
const NOT_IN_A_FILE_NAME = /[\p{Cc}/\\:*?"<>|]/gu;

/**
 * What the download is called: the saved filter whose selection is shown, or the report's own
 * title where none is, then the moment it was taken (US-17).
 */
export function exportFileName(
  { filterName, exportedAt }: ReportProvenance,
  extension: string,
): string {
  const cleaned = (filterName ?? "").replace(NOT_IN_A_FILE_NAME, " ").replace(/\s+/g, " ").trim();
  const base = cleaned === "" ? REPORT_TITLE : cleaned;

  return `${base} - ${fileStamp(exportedAt)}.${extension}`;
}
