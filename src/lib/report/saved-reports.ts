/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { sameFilter } from "@/lib/filters/student-filter";
import type { ReportSelection, SavedReport } from "@/lib/schemas/saved-report";

/** Which order the tags were pressed in is no part of what a report shows (US-13). */
function sameFields(left: readonly string[], right: readonly string[]): boolean {
  const chosen = new Set(left);
  return chosen.size === new Set(right).size && right.every((key) => chosen.has(key));
}

/**
 * The saved report the page currently is, or null where it is none of them. The tag row marks
 * it and the exports are named after it (US-13, US-17); asked once here, the two cannot come to
 * disagree about which report a teacher is looking at.
 */
export function matchingSavedReport(
  reports: readonly SavedReport[],
  current: ReportSelection,
): SavedReport | null {
  return (
    reports.find(
      (candidate) =>
        sameFilter(candidate.filter, current.filter) &&
        sameFields(candidate.fields, current.fields),
    ) ?? null
  );
}
