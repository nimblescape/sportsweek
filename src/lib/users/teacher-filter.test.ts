/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { Teacher } from "./use-teachers";
import {
  EMPTY_TEACHER_FILTER,
  filterTeachers,
  hasNoFilter,
  togglePermissionTag,
  toggleWithoutPermissions,
} from "./teacher-filter";

const teacher = (firstName: string, lastName: string, ...permissions: string[]): Teacher => ({
  uid: `uid-of-${firstName}-${lastName}`,
  email: `${firstName}.${lastName}@htldornbirn.at`.toLowerCase(),
  firstName,
  lastName,
  permissions: permissions as Teacher["permissions"],
});

const ADA = teacher("Ada", "Auer", "editUsers");
const BOB = teacher("Bob", "Berger", "editMasterData", "editAssignments");
const CLARA = teacher("Clara", "Cerny");

const ALL = [ADA, BOB, CLARA];
const namesOf = (teachers: readonly Teacher[]) => teachers.map((one) => one.lastName);

describe("filterTeachers", () => {
  it("keeps everybody when nothing is filtered", () => {
    expect(filterTeachers(ALL, EMPTY_TEACHER_FILTER)).toEqual(ALL);
  });

  it("matches a surname", () => {
    expect(namesOf(filterTeachers(ALL, { ...EMPTY_TEACHER_FILTER, name: "berg" }))).toEqual([
      "Berger",
    ]);
  });

  it("matches a first name", () => {
    expect(namesOf(filterTeachers(ALL, { ...EMPTY_TEACHER_FILTER, name: "clara" }))).toEqual([
      "Cerny",
    ]);
  });

  it("matches the address, which is how a colleague is often looked up", () => {
    expect(namesOf(filterTeachers(ALL, { ...EMPTY_TEACHER_FILTER, name: "ada.auer@" }))).toEqual([
      "Auer",
    ]);
  });

  it("ignores case and surrounding space", () => {
    expect(namesOf(filterTeachers(ALL, { ...EMPTY_TEACHER_FILTER, name: "  BERGER " }))).toEqual([
      "Berger",
    ]);
  });

  it("keeps nobody when the name matches nobody", () => {
    expect(filterTeachers(ALL, { ...EMPTY_TEACHER_FILTER, name: "zzz" })).toEqual([]);
  });

  it("keeps whoever holds the permission named", () => {
    const filter = { ...EMPTY_TEACHER_FILTER, permissions: ["editUsers"] } as const;

    expect(namesOf(filterTeachers(ALL, filter))).toEqual(["Auer"]);
  });

  /** One row, so the tags read as alternatives — the same as any one category on the report. */
  it("keeps whoever holds any of several", () => {
    const filter = {
      ...EMPTY_TEACHER_FILTER,
      permissions: ["editUsers", "editMasterData"],
    } as const;

    expect(namesOf(filterTeachers(ALL, filter))).toEqual(["Auer", "Berger"]);
  });

  it("leaves out somebody holding none of them", () => {
    const filter = { ...EMPTY_TEACHER_FILTER, permissions: ["editUsers"] } as const;

    expect(namesOf(filterTeachers(ALL, filter))).not.toContain("Cerny");
  });

  it("applies the name and the tags together", () => {
    const filter = { ...EMPTY_TEACHER_FILTER, name: "a", permissions: ["editMasterData"] } as const;

    expect(namesOf(filterTeachers(ALL, filter))).toEqual(["Berger"]);
  });
});

/**
 * Who is waiting for access, which is the question the page is most often opened to answer.
 * It is a tag in the same row, so it reads as one more alternative rather than a mode.
 */
describe("filterTeachers — the tag for holding nothing", () => {
  const without = { ...EMPTY_TEACHER_FILTER, withoutPermissions: true };

  it("keeps only those holding none", () => {
    expect(namesOf(filterTeachers(ALL, without))).toEqual(["Cerny"]);
  });

  it("reads as an alternative beside a permission, not a narrowing of it", () => {
    const filter = { ...without, permissions: ["editUsers"] } as const;

    expect(namesOf(filterTeachers(ALL, filter))).toEqual(["Auer", "Cerny"]);
  });

  it("still respects the name beside it", () => {
    expect(namesOf(filterTeachers(ALL, { ...without, name: "zzz" }))).toEqual([]);
  });
});

describe("toggleWithoutPermissions", () => {
  it("presses it, and releases it again", () => {
    const pressed = toggleWithoutPermissions(EMPTY_TEACHER_FILTER);

    expect(pressed.withoutPermissions).toBe(true);
    expect(toggleWithoutPermissions(pressed).withoutPermissions).toBe(false);
  });

  it("leaves the permission tags and the name alone", () => {
    const filter = { name: "auer", permissions: ["editUsers"], withoutPermissions: false } as const;

    const pressed = toggleWithoutPermissions(filter);

    expect(pressed.permissions).toEqual(["editUsers"]);
    expect(pressed.name).toBe("auer");
  });
});

describe("togglePermissionTag", () => {
  it("presses one that was not pressed", () => {
    expect(togglePermissionTag(EMPTY_TEACHER_FILTER, "editUsers").permissions).toEqual([
      "editUsers",
    ]);
  });

  it("releases one that was", () => {
    const pressed = { ...EMPTY_TEACHER_FILTER, permissions: ["editUsers"] } as const;

    expect(togglePermissionTag(pressed, "editUsers").permissions).toEqual([]);
  });

  it("leaves the name alone", () => {
    const filter = { ...EMPTY_TEACHER_FILTER, name: "auer" };

    expect(togglePermissionTag(filter, "editUsers").name).toBe("auer");
  });
});

describe("hasNoFilter", () => {
  it("is true when nothing is typed and no tag is pressed", () => {
    expect(hasNoFilter(EMPTY_TEACHER_FILTER)).toBe(true);
  });

  it("is false once a tag is pressed", () => {
    expect(hasNoFilter({ ...EMPTY_TEACHER_FILTER, permissions: ["editUsers"] })).toBe(false);
  });

  it("is false once the tag for holding nothing is pressed", () => {
    expect(hasNoFilter({ ...EMPTY_TEACHER_FILTER, withoutPermissions: true })).toBe(false);
  });

  /** The "Alle" tag answers for the tags, not for the name field beside it. */
  it("stays true while only a name is typed", () => {
    expect(hasNoFilter({ ...EMPTY_TEACHER_FILTER, name: "auer" })).toBe(true);
  });
});
