/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_VALUES,
  EMPTY_FILTER,
  clearTags,
  filterGroups,
  filterStudents,
  hasNoTags,
  matchesFilter,
  toggleTag,
  type FilterableStudent,
} from "./student-filter";

function student(overrides: Partial<FilterableStudent> = {}): FilterableStudent {
  return {
    firstName: "Anna",
    lastName: "Muster",
    class: "5AHIF",
    gender: "female",
    program: "Ski",
    skillLevel: "Keine Vorkenntnisse",
    isAttending: true,
    ...overrides,
  };
}

const ANNA = student();
const BENE = student({
  firstName: "Bene",
  lastName: "Berger",
  class: "5BHIF",
  gender: "male",
  program: "Snowboard",
  skillLevel: "Fortgeschritten",
});
const CLARA = student({
  firstName: "Clara",
  lastName: "Cerny",
  class: "5BHIF",
  isAttending: false,
});

const withTags = (...tags: [Parameters<typeof toggleTag>[1], string][]) =>
  tags.reduce((filter, [category, value]) => toggleTag(filter, category, value), EMPTY_FILTER);

describe("matchesFilter", () => {
  it("keeps every student while nothing is selected", () => {
    for (const candidate of [ANNA, BENE, CLARA]) {
      expect(matchesFilter(candidate, EMPTY_FILTER)).toBe(true);
    }
  });

  it("matches the free text against the first name", () => {
    expect(matchesFilter(ANNA, { ...EMPTY_FILTER, name: "ann" })).toBe(true);
    expect(matchesFilter(BENE, { ...EMPTY_FILTER, name: "ann" })).toBe(false);
  });

  it("matches the free text against the last name", () => {
    expect(matchesFilter(ANNA, { ...EMPTY_FILTER, name: "must" })).toBe(true);
    expect(matchesFilter(BENE, { ...EMPTY_FILTER, name: "must" })).toBe(false);
  });

  it("ignores case and surrounding space in the free text", () => {
    expect(matchesFilter(ANNA, { ...EMPTY_FILTER, name: "  MUSTER " })).toBe(true);
  });

  it("ORs the tags selected within one category", () => {
    const filter = withTags(["class", "5AHIF"], ["class", "5BHIF"]);

    expect(matchesFilter(ANNA, filter)).toBe(true);
    expect(matchesFilter(BENE, filter)).toBe(true);
    expect(matchesFilter(student({ class: "5CHIF" }), filter)).toBe(false);
  });

  it("ANDs across categories", () => {
    const filter = withTags(["class", "5BHIF"], ["gender", "male"]);

    expect(matchesFilter(BENE, filter)).toBe(true);
    expect(matchesFilter(student({ class: "5BHIF", gender: "female" }), filter)).toBe(false);
    expect(matchesFilter(student({ class: "5AHIF", gender: "male" }), filter)).toBe(false);
  });

  it("lets a category with nothing selected restrict nothing", () => {
    const filter = withTags(["gender", "female"]);

    expect(matchesFilter(ANNA, filter)).toBe(true);
    expect(matchesFilter(student({ class: "5ZZZZ" }), filter)).toBe(true);
  });

  it("excludes a student who has not answered a category that is being filtered", () => {
    expect(matchesFilter(student({ class: null }), withTags(["class", "5AHIF"]))).toBe(false);
  });

  it("reads attendance off the answer rather than off a stored tag", () => {
    const attending = withTags(["attendance", ATTENDANCE_VALUES.attending]);
    const away = withTags(["attendance", ATTENDANCE_VALUES.notAttending]);

    expect(matchesFilter(ANNA, attending)).toBe(true);
    expect(matchesFilter(CLARA, attending)).toBe(false);
    expect(matchesFilter(CLARA, away)).toBe(true);
  });

  it("combines the free text with the tags", () => {
    const filter = { ...withTags(["class", "5BHIF"]), name: "clara" };

    expect(matchesFilter(CLARA, filter)).toBe(true);
    expect(matchesFilter(BENE, filter)).toBe(false);
  });
});

describe("toggleTag", () => {
  it("adds a tag and removes it again", () => {
    const selected = toggleTag(EMPTY_FILTER, "class", "5AHIF");
    expect(selected.tags.class).toEqual(["5AHIF"]);

    expect(toggleTag(selected, "class", "5AHIF").tags.class).toEqual([]);
  });

  it("leaves every other category untouched", () => {
    const filter = withTags(["class", "5AHIF"], ["gender", "male"]);

    const next = toggleTag(filter, "class", "5BHIF");

    expect(next.tags.class).toEqual(["5AHIF", "5BHIF"]);
    expect(next.tags.gender).toEqual(["male"]);
  });

  it("keeps the free text, which the tags have no say over", () => {
    const next = toggleTag({ ...EMPTY_FILTER, name: "anna" }, "class", "5AHIF");

    expect(next.name).toBe("anna");
  });
});

describe("clearTags", () => {
  it("deselects every category at once", () => {
    const filter = withTags(["class", "5AHIF"], ["gender", "male"], ["program", "Ski"]);

    expect(hasNoTags(clearTags(filter))).toBe(true);
  });

  it("leaves the free text alone, which is not a tag", () => {
    const filter = { ...withTags(["class", "5AHIF"]), name: "anna" };

    expect(clearTags(filter).name).toBe("anna");
  });
});

describe("hasNoTags", () => {
  it("holds while nothing is selected and stops at the first tag", () => {
    expect(hasNoTags(EMPTY_FILTER)).toBe(true);
    expect(hasNoTags(withTags(["skillLevel", "Fortgeschritten"]))).toBe(false);
  });

  it("ignores the free text, so typing a name does not unlight the 'Alle' tag", () => {
    expect(hasNoTags({ ...EMPTY_FILTER, name: "anna" })).toBe(true);
  });
});

describe("filterStudents", () => {
  it("keeps the given order and drops what does not match", () => {
    const filter = withTags(["class", "5BHIF"]);

    expect(filterStudents([ANNA, BENE, CLARA], filter)).toEqual([BENE, CLARA]);
  });
});

describe("filterGroups", () => {
  const lists = {
    classes: [{ name: "5AHIF" }, { name: "5BHIF" }],
    programs: [{ name: "Ski" }, { name: "Snowboard" }],
    skillLevels: [{ name: "Keine Vorkenntnisse" }],
  };

  it("offers class, gender, program and skill level, in that order", () => {
    expect(filterGroups(lists).map((group) => group.category)).toEqual([
      "class",
      "gender",
      "program",
      "skillLevel",
    ]);
  });

  it("appends attendance only where it is asked for, as the report does (US-13)", () => {
    expect(filterGroups(lists, { attendance: true }).map((group) => group.category)).toEqual([
      "class",
      "gender",
      "program",
      "skillLevel",
      "attendance",
    ]);
  });

  it("takes the options from the maintained lists rather than naming them itself", () => {
    const [classes] = filterGroups(lists);

    expect(classes.options).toEqual([
      { value: "5AHIF", label: "5AHIF" },
      { value: "5BHIF", label: "5BHIF" },
    ]);
  });
});
