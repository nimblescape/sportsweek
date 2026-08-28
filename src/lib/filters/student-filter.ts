/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { ANSWER_LABELS } from "@/lib/master-data/categories";
import { snapshotValueSchema, type Gender } from "@/lib/schemas/common";
import { FOOD_OPTION_OTHER, FOOD_OPTION_OTHER_LABEL } from "@/lib/schemas/master-data";
import {
  ATTENDANCE_LABELS,
  EQUIPMENT_RENTAL_LABEL,
  GENDER_LABELS,
  HEALTH_LABEL,
  HEALTH_NOTED_LABEL,
  INCOMPLETE_REGISTRATION_HINT,
  NO_EQUIPMENT_RENTAL_LABEL,
} from "@/lib/registration/answer-labels";

/**
 * The one filter the assignment dialog (US-12) and the report (US-13) both use. It is written
 * once because both describe the same behaviour, and it is kept plain — strings and arrays,
 * nothing derived — so the report can save a selection and restore it later (US-13).
 *
 * The order is the one the report's fields row lists the same answers in, so a teacher reading
 * the two rows one under the other finds an answer in the same place in both.
 */
export const FILTER_CATEGORIES = [
  "attendance",
  "event",
  "class",
  "gender",
  "program",
  "equipmentRental",
  "skillLevel",
  "seasonPassOption",
  "busPickupPoint",
  "foodOption",
  "health",
  "completeness",
] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/**
 * Which field tag of the report each category shows the same answer as. Declarative rather than
 * inferred, because two of them are not spelled alike: the equipment category filters on whether
 * anything is rented while the field lists what is, and the food field folds its free text in.
 * The test that holds the two rows in the same order reads it from here.
 */
export const FIELD_TAG_KEY_BY_CATEGORY: Record<FilterCategory, string> = {
  attendance: "attendance",
  event: "event",
  class: "class",
  gender: "gender",
  program: "program",
  equipmentRental: "rentedEquipment",
  skillLevel: "skillLevel",
  seasonPassOption: "seasonPassOption",
  busPickupPoint: "busPickupPoint",
  foodOption: "food",
  health: "health",
  completeness: "completeness",
};

/** Attendance is an answer, not a list value, so its two tags need values of their own (US-11). */
export const ATTENDANCE_VALUES = { attending: "attending", notAttending: "notAttending" } as const;

/** So is whether a registration is still missing answers, which is a flag rather than a list. */
export const COMPLETENESS_VALUES = { complete: "complete", incomplete: "incomplete" } as const;

/** Renting is filtered by the yes-or-no answer alone; which items are rented is a detail line. */
export const EQUIPMENT_RENTAL_VALUES = { needed: "needed", notNeeded: "notNeeded" } as const;

/** One value per side of a question the two health answers are read as together (US-11). */
export const HEALTH_VALUES = { noted: "noted", none: "none" } as const;

export type FilterableStudent = {
  firstName: string;
  lastName: string;
  class: string | null;
  gender: Gender | null;
  program: string | null;
  skillLevel: string | null;
  isAttending: boolean;
  /** The event a teacher assigned them to (US-12), by name; null means no week yet. */
  event: string | null;
  isIncomplete: boolean;
  /** Null where the question was never put — unanswered, or a programme needing no equipment. */
  equipmentRentalNeeded: boolean | null;
  healthNotes: string | null;
  hasMedication: boolean | null;
  busPickupPoint: string | null;
  seasonPassOption: string | null;
  foodOption: string | null;
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
    attendance: [],
    event: [],
    class: [],
    gender: [],
    program: [],
    equipmentRental: [],
    skillLevel: [],
    seasonPassOption: [],
    busPickupPoint: [],
    foodOption: [],
    health: [],
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

/**
 * The filter with every tag no category offers any more taken out.
 *
 * A saved report holds the tags that were chosen when it was saved (US-13), and the lists behind
 * them keep changing: a class is renamed, a program is removed. A tag standing for something that
 * no longer exists cannot be seen and cannot be unpressed, but it still restricts — and it
 * restricts to nobody, so the report would open empty with nothing on screen to explain it.
 *
 * A category that offers nothing at all is not among `groups` either, because an empty list is a
 * question nobody was asked (US-21), so its tags go the same way. Telling that apart from a list
 * that has not arrived yet is the caller's job: one document carries every list, so a view waits
 * for it rather than scoping against a series it has not read.
 */
export function scopeFilterToGroups(
  filter: StudentFilter,
  groups: readonly FilterGroup[],
): StudentFilter {
  const offered = new Map(
    groups.map((group) => [group.category, new Set(group.options.map((option) => option.value))]),
  );

  return {
    ...filter,
    tags: Object.fromEntries(
      FILTER_CATEGORIES.map((category) => {
        const values = offered.get(category);
        if (values === undefined) return [category, []];
        return [category, filter.tags[category].filter((value) => values.has(value))];
      }),
    ) as StudentFilter["tags"],
  };
}

/**
 * What the filter leaves, in words: the name being searched for, then the tags chosen, grouped
 * by category so that what is an "or" and what is an "and" survives the wording. Null where it
 * restricts nothing, which is a report of everybody and has nothing to say about itself. A tag
 * no category offers any more is passed over, exactly as the tag row passes over it (US-13).
 */
export function filterSummary(
  filter: StudentFilter,
  groups: readonly FilterGroup[],
): string | null {
  const name = filter.name.trim();
  const parts = [
    ...(name === "" ? [] : [`Name: ${name}`]),
    ...groups.flatMap((group) => {
      const chosen = filter.tags[group.category];
      const labels = group.options.filter((option) => chosen.includes(option.value));
      return labels.length === 0 ? [] : [labels.map((option) => option.label).join(", ")];
    }),
  ];

  return parts.length === 0 ? null : parts.join(" \u00b7 ");
}

const GENDER_OPTIONS: readonly FilterOption[] = [
  { value: "male", label: GENDER_LABELS.male },
  { value: "female", label: GENDER_LABELS.female },
];

/** Named in full, since the tag now reads as its own category would and would otherwise stutter. */
const ATTENDANCE_OPTIONS: readonly FilterOption[] = [
  {
    value: ATTENDANCE_VALUES.attending,
    label: ATTENDANCE_LABELS.attending,
    name: ATTENDANCE_LABELS.attending,
  },
  {
    value: ATTENDANCE_VALUES.notAttending,
    label: ATTENDANCE_LABELS.notAttending,
    name: ATTENDANCE_LABELS.notAttending,
  },
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

/** Both tags name the equipment themselves, because the row they sit in carries no headings. */
const EQUIPMENT_RENTAL_OPTIONS: readonly FilterOption[] = [
  {
    value: EQUIPMENT_RENTAL_VALUES.needed,
    label: EQUIPMENT_RENTAL_LABEL,
    name: EQUIPMENT_RENTAL_LABEL,
  },
  {
    value: EQUIPMENT_RENTAL_VALUES.notNeeded,
    label: NO_EQUIPMENT_RENTAL_LABEL,
    name: NO_EQUIPMENT_RENTAL_LABEL,
  },
];

/** One tag, not two: a teacher looks for the students to be aware of, not for the rest. */
const HEALTH_OPTIONS: readonly FilterOption[] = [
  { value: HEALTH_VALUES.noted, label: HEALTH_NOTED_LABEL },
];

/** Whether a student has anything health-related to be aware of, which is either answer (US-11). */
function hasHealthNote(student: FilterableStudent): boolean {
  return (student.healthNotes ?? "").trim() !== "" || student.hasMedication === true;
}

/** A list value is stored as the plain text it was chosen as (US-11), so it is its own tag. */
const asOptions = (names: readonly string[]): FilterOption[] =>
  names.map((name) => ({ value: name, label: name }));

type MaintainedLists = {
  classes: readonly string[];
  programs: readonly { name: string }[];
  skillLevels: readonly string[];
  busPickupPoints?: readonly string[];
  seasonPassOptions?: readonly string[];
  foodOptions?: readonly string[];
};

type FilterGroupOptions = {
  attendance?: boolean;
  completeness?: boolean;
  equipmentRental?: boolean;
  health?: boolean;
  busPickupPoint?: boolean;
  seasonPassOption?: boolean;
  foodOption?: boolean;
  events?: readonly string[];
};

/**
 * The tag row. The four US-12 gives are always offered; the report adds the categories only it
 * has a use for — it is the one view that also lists the students who stay at home, whose cards
 * are not already one per event, and that says whose registration is still missing answers
 * (US-13). They are pushed in the order the report's fields row lists the same answers.
 *
 * A category whose list is empty is left out altogether, because an empty list is a question the
 * student was never asked (US-21) — so there is nothing to filter by and no tag to offer.
 */
export function filterGroups(
  lists: MaintainedLists,
  {
    attendance,
    completeness,
    equipmentRental,
    health,
    busPickupPoint,
    seasonPassOption,
    foodOption,
    events,
  }: FilterGroupOptions = {},
): FilterGroup[] {
  const groups: FilterGroup[] = [];

  /** Offered only where the list behind it has entries, which is the whole of the US-21 rule. */
  const pushList = (category: FilterCategory, label: string, options: FilterOption[]) => {
    if (options.length > 0) groups.push({ category, label, options });
  };

  if (attendance) {
    groups.push({ category: "attendance", label: "Teilnahme", options: ATTENDANCE_OPTIONS });
  }
  if (events) {
    pushList("event", ANSWER_LABELS.event, asOptions(events));
  }

  pushList("class", ANSWER_LABELS.class, asOptions(lists.classes));
  groups.push({ category: "gender", label: "Geschlecht", options: GENDER_OPTIONS });
  pushList(
    "program",
    ANSWER_LABELS.program,
    asOptions(lists.programs.map((program) => program.name)),
  );

  // Between the program and the skill level, where the fields row keeps the same answer.
  if (equipmentRental) {
    groups.push({
      category: "equipmentRental",
      label: EQUIPMENT_RENTAL_LABEL,
      options: EQUIPMENT_RENTAL_OPTIONS,
    });
  }

  pushList("skillLevel", ANSWER_LABELS.skillLevel, asOptions(lists.skillLevels));

  if (seasonPassOption) {
    pushList(
      "seasonPassOption",
      ANSWER_LABELS.seasonPassOption,
      asOptions(lists.seasonPassOptions ?? []),
    );
  }
  if (busPickupPoint) {
    pushList(
      "busPickupPoint",
      ANSWER_LABELS.busPickupPoint,
      asOptions(lists.busPickupPoints ?? []),
    );
  }
  if (foodOption) {
    const food = lists.foodOptions ?? [];
    // The free-text choice is offered to students without being a row a teacher keeps (US-9) —
    // and an answer cannot summon its own question, so it goes with the list (US-21).
    pushList(
      "foodOption",
      ANSWER_LABELS.foodOption,
      food.length === 0
        ? []
        : [...asOptions(food), { value: FOOD_OPTION_OTHER, label: FOOD_OPTION_OTHER_LABEL }],
    );
  }
  if (health) {
    groups.push({ category: "health", label: HEALTH_LABEL, options: HEALTH_OPTIONS });
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
      return student.event;
    case "equipmentRental":
      if (student.equipmentRentalNeeded === null) return null;
      return student.equipmentRentalNeeded
        ? EQUIPMENT_RENTAL_VALUES.needed
        : EQUIPMENT_RENTAL_VALUES.notNeeded;
    case "busPickupPoint":
      return student.busPickupPoint;
    case "seasonPassOption":
      return student.seasonPassOption;
    case "foodOption":
      return student.foodOption;
    case "health":
      return hasHealthNote(student) ? HEALTH_VALUES.noted : HEALTH_VALUES.none;
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
