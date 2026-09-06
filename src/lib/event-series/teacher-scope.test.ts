/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { ClassOption } from "@/lib/schemas/master-data";
import { scopedEventSeries, type ScopableEventSeries } from "./teacher-scope";

const TEACHER = asUid("uidTeacher");
const COLLEAGUE = asUid("uidColleague");

function classOption(name: string, teacherUids: ClassOption["teacherUids"] = []): ClassOption {
  return { name, teacherUids };
}

function series(
  id: string,
  classOptions: ClassOption[] = [],
  isArchived = false,
): ScopableEventSeries {
  return { id, isArchived, classOptions };
}

describe("scopedEventSeries", () => {
  it("offers every unarchived series when no teacher uid is asked for", () => {
    const eventSeries = [series("s1", [classOption("2aWI", [TEACHER])]), series("s2")];

    expect(scopedEventSeries(eventSeries, null)).toEqual(eventSeries);
  });

  it("offers every unarchived series when the teacher looks after no class anywhere", () => {
    const eventSeries = [series("s1", [classOption("2aWI", [COLLEAGUE])]), series("s2")];

    expect(scopedEventSeries(eventSeries, TEACHER)).toEqual(eventSeries);
  });

  it("offers only the series the teacher looks after a class in", () => {
    const own = series("s1", [classOption("2aWI", [TEACHER])]);
    const other = series("s2", [classOption("3aWI", [COLLEAGUE])]);

    expect(scopedEventSeries([own, other], TEACHER)).toEqual([own]);
  });

  it("does not widen back out for a colleague once the teacher is scoped anywhere", () => {
    const own = series("s1", [classOption("2aWI", [TEACHER])]);
    const untouched = series("s2");

    expect(scopedEventSeries([own, untouched], TEACHER)).toEqual([own]);
  });

  it("leaves an archived series out, whether or not the teacher looks after one of its classes", () => {
    const archived = series("old", [classOption("2aWI", [TEACHER])], true);
    const live = series("s1", [classOption("2aWI", [TEACHER])]);

    expect(scopedEventSeries([archived, live], TEACHER)).toEqual([live]);
  });
});
