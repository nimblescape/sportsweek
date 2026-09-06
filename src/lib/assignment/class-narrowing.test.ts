/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { ClassOption } from "@/lib/schemas/master-data";
import { narrowedClasses } from "./class-narrowing";

const TEACHER = asUid("uidTeacher");
const COLLEAGUE = asUid("uidColleague");

function classOption(name: string, teacherUids: ClassOption["teacherUids"] = []): ClassOption {
  return { name, teacherUids };
}

describe("narrowedClasses", () => {
  it("returns null when no teacher uid is asked for", () => {
    const classes = [classOption("2aWI", [TEACHER])];

    expect(narrowedClasses(classes, null)).toBeNull();
  });

  it("returns null when the teacher looks after none of the classes", () => {
    const classes = [classOption("2aWI", [COLLEAGUE]), classOption("2bWI", [])];

    expect(narrowedClasses(classes, TEACHER)).toBeNull();
  });

  it("returns only the classes the teacher looks after", () => {
    const classes = [
      classOption("2aWI", [TEACHER]),
      classOption("2bWI", [COLLEAGUE]),
      classOption("3aWI", [TEACHER, COLLEAGUE]),
    ];

    expect(narrowedClasses(classes, TEACHER)).toEqual(["2aWI", "3aWI"]);
  });

  it("returns null for an empty class list", () => {
    expect(narrowedClasses([], TEACHER)).toBeNull();
  });
});
