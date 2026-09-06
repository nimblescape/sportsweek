/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Uid } from "@/lib/schemas/common";
import type { ClassOption } from "@/lib/schemas/master-data";

/** What deciding a teacher's scope needs of a series, and no more (US-42). */
export type ScopableEventSeries = {
  id: string;
  isArchived: boolean;
  classOptions: readonly ClassOption[];
};

/**
 * Which series a teacher is scoped to (US-42): the unarchived ones they look after a class in,
 * or — for somebody who looks after none of them anywhere — every unarchived series, exactly as
 * before this feature existed. The same widening direction as `narrowedClasses` (US-39): looking
 * after nothing narrows nothing, and losing a last assignment widens back out rather than locking
 * anybody out of every series.
 *
 * Decided by class assignments alone: no permission enters this function, and none is meant to.
 * The same answer is meant to decide the header's tag row, a page's guard and the landing
 * redirect, so all three call this rather than each asking the question their own way.
 */
export function scopedEventSeries<T extends ScopableEventSeries>(
  eventSeries: readonly T[],
  teacherUid: Uid | null,
): T[] {
  const live = eventSeries.filter((one) => !one.isArchived);
  if (teacherUid === null) return live;

  const assigned = live.filter((one) =>
    one.classOptions.some((option) => option.teacherUids.includes(teacherUid)),
  );
  return assigned.length > 0 ? assigned : live;
}
