/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { snapshotValueSchema, type Gender } from "@/lib/schemas/common";
import { INCOMPLETE_REGISTRATION_HINT } from "@/lib/student-master-data/answer-labels";

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
  "event",
  "completeness",
] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/** Attendance is an answer, not a list value, so its two tags need values of their own (US-11). */
export const ATTENDANCE_VALUES = { attending: "attending", notAttending: "notAttending" } as const;

/** So is whether a registration is still missing answers, which is a flag rather than a list. */
export const COMPLETENESS_VALUES = { complete: "complete", incomplete: "incomplete" } as const;

export type FilterableStudent = {
  firstName: string;
  lastName: string;
  class: string | null;
  gender: Gender | null;
  program: string | null;
  skillLevel: string | null;
  isAttending: boolean;
  /** The event a teacher assigned them to (US-12); null means no week yet. */
  eventId: string | null;
  isIncomplete: boolean;
};

const FILTER_NAME_MAX = 120;

const tagsSchema = z.object(
  Object.fromEntries(
    // Defaulted per category, so a filter saved before a category existed reads back as
    // "no restriction from it" instead of failing to parse and disappearing (US-13).
    FILTER_CATEGORIES.map((category) => [category, z.array(snapshotValueSchema).default([])]),
  ) as Record<FilterCategory, z.ZodDefault<z.ZodArray<typeof snapshotValueSchema>>>,
);

/**
 * A selection, as a schema rather than only a type, because the report stores one under a name
 * and reads it back from a place a client can write to (US-13).
 */
export const studentFilterSchema = z.object({
  /** Matched against the first name and the last name (US-12). */
  name: z.string().trim().max(FILTER_NAME_MAX, `Höchstens ${FILTER_NAME_MAX} Zeichen.`),
  tags: tagsSchema,
});
export type StudentFilter = z.infer<typeof studentFilterSchema>;

export const EMPTY_FILTER: StudentFilter = {
  name: "",
  tags: {
    class: [],
    gender: [],
    program: [],
    skillLevel: [],
    attendance: [],
    event: [],
    completeness: [],
  },
};

export type FilterOption = {
  value: string;
  label: string;
  /** The accessible name, where the label already names its category and `Kategorie: Wert` would stutter. */
  name?: string;
};
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

/**
 * One tag, not two: a teacher filters the report down to the registrations they still have to
 * chase, and "complete" is simply everyone else. It is worded exactly as the master line marks
 * them, so the tag and the mark cannot come to say different things (US-13).
 */
const COMPLETENESS_OPTIONS: readonly FilterOption[] = [
  {
    value: COMPLETENESS_VALUES.incomplete,
    label: INCOMPLETE_REGISTRATION_HINT,
    name: INCOMPLETE_REGISTRATION_HINT,
  },
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
 * An event is the one tag whose value is not the label: a record points at it by id, because
 * unlike the teacher-maintained lists it is a genuine reference (US-11, US-12).
 */
type EventOption = { id: string; name: string };

type FilterGroupOptions = {
  attendance?: boolean;
  completeness?: boolean;
  events?: readonly EventOption[];
};

/**
 * The tag row, in the order US-12 gives: class, gender, program, skill level. The report appends
 * the categories only it has a use for — it is the one view that also lists the students who
 * stay at home, whose cards are not already one per event, and that says whose registration is
 * still missing answers (US-13).
 */
export function filterGroups(
  lists: MaintainedLists,
  { attendance, completeness, events }: FilterGroupOptions = {},
): FilterGroup[] {
  const groups: FilterGroup[] = [
    { category: "class", label: "Klasse", options: asOptions(lists.classes) },
    { category: "gender", label: "Geschlecht", options: GENDER_OPTIONS },
    { category: "program", label: "Programm", options: asOptions(lists.programs) },
    { category: "skillLevel", label: "Leistungsstufe", options: asOptions(lists.skillLevels) },
  ];

  if (attendance) {
    groups.push({ category: "attendance", label: "Teilnahme", options: ATTENDANCE_OPTIONS });
  }
  if (events) {
    groups.push({
      category: "event",
      label: "Event",
      options: events.map((event) => ({ value: event.id, label: event.name })),
    });
  }
  if (completeness) {
    groups.push({
      category: "completeness",
      label: "Registrierung",
      options: COMPLETENESS_OPTIONS,
    });
  }

  return groups;
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
    case "event":
      return student.eventId;
    case "completeness":
      return student.isIncomplete ? COMPLETENESS_VALUES.incomplete : COMPLETENESS_VALUES.complete;
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

/**
 * Whether two selections say the same thing. Compared as sets, because the order tags were
 * pressed in is not part of what a filter means — this is what lets the report name the saved
 * filter it is currently showing, and stop naming it the moment a tag is changed (US-13).
 */
export function sameFilter(left: StudentFilter, right: StudentFilter): boolean {
  if (left.name.trim() !== right.name.trim()) return false;

  return FILTER_CATEGORIES.every((category) => {
    const chosen = new Set(left.tags[category]);
    const other = right.tags[category];
    return chosen.size === new Set(other).size && other.every((tag) => chosen.has(tag));
  });
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
