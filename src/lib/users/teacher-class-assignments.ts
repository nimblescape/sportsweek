/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Uid } from "@/lib/schemas/common";
import type { EventSeries } from "@/lib/schemas/event-series";

/** One class a teacher looks after, and the series it belongs to (US-38, US-41). */
export type ClassAssignment = { eventSeriesName: string; className: string };

/**
 * Every class this teacher looks after, across every event series (US-41) — in series order,
 * then in each series' own class order, since neither carries a meaning worth re-sorting by.
 */
export function classAssignmentsOf(
  eventSeries: readonly EventSeries[],
  uid: Uid,
): ClassAssignment[] {
  return eventSeries.flatMap((series) =>
    series.classOptions
      .filter((option) => option.teacherUids.includes(uid))
      .map((option) => ({ eventSeriesName: series.name, className: option.name })),
  );
}
