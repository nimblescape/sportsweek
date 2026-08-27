/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Gender } from "@/lib/schemas/common";

/**
 * The one filter the assignment dialog (US-12) and the report (US-13) both use. It is written
 * once because both describe the same behaviour, and it is kept plain — strings and arrays,
 * nothing derived — so the report can save a selection and restore it later (US-13).
 */
export const FILTER_CATEGORIES = [
  "class",
  "gender",
  "program",
  "skillLevel",
  "attendance",
] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/** Attendance is an answer, not a list value, so its two tags need values of their own (US-11). */
export const ATTENDANCE_VALUES = { attending: "attending", notAttending: "notAttending" } as const;

export type FilterableStudent = {
  firstName: string;
  lastName: string;
  class: string | null;
  gender: Gender | null;
  program: string | null;
  skillLevel: string | null;
  isAttending: boolean;
};

export type StudentFilter = {
  /** Matched against the first name and the last name (US-12). */
  name: string;
  tags: Readonly<Record<FilterCategory, readonly string[]>>;
};

export const EMPTY_FILTER: StudentFilter = {
  name: "",
  tags: { class: [], gender: [], program: [], skillLevel: [], attendance: [] },
};

export type FilterOption = { value: string; label: string };
export type FilterGroup = {
  category: FilterCategory;
  label: string;
  options: readonly FilterOption[];
};

const GENDER_OPTIONS: readonly FilterOption[] = [
  { value: "male", label: "männlich" },
  { value: "female", label: "weiblich" },
];

const ATTENDANCE_OPTIONS: readonly FilterOption[] = [
  { value: ATTENDANCE_VALUES.attending, label: "nimmt teil" },
  { value: ATTENDANCE_VALUES.notAttending, label: "nimmt nicht teil" },
];

/** A list value is stored as the plain text it was chosen as (US-11), so it is its own tag. */
const asOptions = (items: readonly { name: string }[]): FilterOption[] =>
  items.map((item) => ({ value: item.name, label: item.name }));

type MaintainedLists = {
  classes: readonly { name: string }[];
  programs: readonly { name: string }[];
  skillLevels: readonly { name: string }[];
};

/**
 * The tag row, in the order US-12 gives: class, gender, program, skill level. The report adds
 * attendance because it is the one view that also lists the students who stay at home (US-13).
 */
export function filterGroups(
  lists: MaintainedLists,
  options: { attendance?: boolean } = {},
): FilterGroup[] {
  const groups: FilterGroup[] = [
    { category: "class", label: "Klasse", options: asOptions(lists.classes) },
    { category: "gender", label: "Geschlecht", options: GENDER_OPTIONS },
    { category: "program", label: "Programm", options: asOptions(lists.programs) },
    { category: "skillLevel", label: "Leistungsstufe", options: asOptions(lists.skillLevels) },
  ];

  return options.attendance
    ? [...groups, { category: "attendance", label: "Teilnahme", options: ATTENDANCE_OPTIONS }]
    : groups;
}

function valueOf(student: FilterableStudent, category: FilterCategory): string | null {
  switch (category) {
    case "class":
      return student.class;
    case "gender":
      return student.gender;
    case "program":
      return student.program;
    case "skillLevel":
      return student.skillLevel;
    case "attendance":
      return student.isAttending ? ATTENDANCE_VALUES.attending : ATTENDANCE_VALUES.notAttending;
  }
}

export function toggleTag(
  filter: StudentFilter,
  category: FilterCategory,
  value: string,
): StudentFilter {
  const selected = filter.tags[category];
  const next = selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];

  return { ...filter, tags: { ...filter.tags, [category]: next } };
}

/** What the "all" tag does: it deselects across every category, and leaves the free text (US-12). */
export function clearTags(filter: StudentFilter): StudentFilter {
  return { ...filter, tags: EMPTY_FILTER.tags };
}

/** Whether the "all" tag is the highlighted one — a question about tags only (US-12). */
export function hasNoTags(filter: StudentFilter): boolean {
  return FILTER_CATEGORIES.every((category) => filter.tags[category].length === 0);
}

export function matchesFilter(student: FilterableStudent, filter: StudentFilter): boolean {
  const needle = filter.name.trim().toLocaleLowerCase("de-AT");
  const matchesName =
    needle === "" ||
    student.firstName.toLocaleLowerCase("de-AT").includes(needle) ||
    student.lastName.toLocaleLowerCase("de-AT").includes(needle);

  if (!matchesName) return false;

  // A category nobody selected in restricts nothing; the ones that were selected in AND together,
  // each satisfied by any one of its tags (US-12).
  return FILTER_CATEGORIES.every((category) => {
    const selected = filter.tags[category];
    if (selected.length === 0) return true;

    const value = valueOf(student, category);
    return value !== null && selected.includes(value);
  });
}

export function filterStudents<T extends FilterableStudent>(
  students: readonly T[],
  filter: StudentFilter,
): T[] {
  return students.filter((student) => matchesFilter(student, filter));
}
