/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Uid } from "@/lib/schemas/common";
import type { ClassOption } from "@/lib/schemas/master-data";

/**
 * Which classes of this series a page offers this reader (US-39): their own, where they look
 * after any of them, or `null` to say every class, unnarrowed. `null` rather than the full list
 * because a caller with a class already renamed or removed out from under a registration must
 * keep showing it, which only the widened, unfiltered path can promise.
 *
 * Looking after nothing narrows nothing (US-39, US-38): the safe direction is the wide one, so a
 * teacher assigned to none of this series' classes is treated exactly as one asked for without a
 * uid at all.
 */
export function narrowedClasses(
  classOptions: readonly ClassOption[],
  teacherUid: Uid | null,
): string[] | null {
  if (teacherUid === null) return null;

  const own = classOptions.filter((option) => option.teacherUids.includes(teacherUid));
  return own.length > 0 ? own.map((option) => option.name) : null;
}
