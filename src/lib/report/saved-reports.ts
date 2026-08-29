/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { sameFilter } from "@/lib/filters/student-filter";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { ReportSelection, SavedReport } from "@/lib/schemas/saved-report";

/**
 * A saved report filters on the lists of one event series, so it lives beneath that series
 * rather than beside it — which is what keeps a report of a Wintersportwoche out of a
 * Kulturwoche's tag row, and what lets a copy take its source's reports along (US-22).
 *
 * Beneath rather than inside: a rule grants a whole document or none of it, and a student reads
 * the event series document to be asked its questions (US-11). A field would hand them every
 * report of every series; a subcollection has a rule of its own.
 */
export function savedReportPath(eventSeriesId: string): string {
  return `${COLLECTIONS.eventSeries}/${eventSeriesId}/${COLLECTIONS.savedReports}`;
}

/** Which order the tags were pressed in is no part of what a report shows (US-13). */
function sameFields(left: readonly string[], right: readonly string[]): boolean {
  const chosen = new Set(left);
  return chosen.size === new Set(right).size && right.every((key) => chosen.has(key));
}

/** Whether a saved report is what the page currently shows, both selections at once (US-13). */
export function sameSelection(saved: ReportSelection, current: ReportSelection): boolean {
  return sameFilter(saved.filter, current.filter) && sameFields(saved.fields, current.fields);
}

/**
 * The saved report the page currently is, or null where it is none of them. What the tag row
 * colours a marked tag by and what an export is named after (US-13, US-17); asked once here, the
 * two cannot come to disagree about which report a teacher is looking at.
 */
export function matchingSavedReport(
  reports: readonly SavedReport[],
  current: ReportSelection,
): SavedReport | null {
  return reports.find((candidate) => sameSelection(candidate, current)) ?? null;
}
