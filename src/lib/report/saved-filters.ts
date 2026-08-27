/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { sameFilter, type StudentFilter } from "@/lib/filters/student-filter";
import type { SavedReportFilter } from "@/lib/schemas/saved-report-filter";

/**
 * The saved filter a selection currently is, or null where it is none of them. The picker marks
 * it and the exports are named after it (US-13, US-17); asked once here, the two cannot come to
 * disagree about which filter a teacher is looking at.
 */
export function matchingSavedFilter(
  filters: readonly SavedReportFilter[],
  current: StudentFilter,
): SavedReportFilter | null {
  return filters.find((candidate) => sameFilter(candidate.filter, current)) ?? null;
}
