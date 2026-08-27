/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { INCOMPLETE_REGISTRATION_HINT } from "@/lib/student-master-data/answer-labels";
import {
  ATTENDANCE_VALUES,
  COMPLETENESS_VALUES,
  EMPTY_FILTER,
  clearTags,
  filterGroups,
  filterStudents,
  filterSummary,
  hasNoTags,
  matchesFilter,
  sameFilter,
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
    eventId: null,
    isIncomplete: false,
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

  it("filters by the event a student is assigned to (US-12, US-13)", () => {
    const montafon = student({ eventId: "event1" });
    const filter = withTags(["event", "event1"]);

    expect(matchesFilter(montafon, filter)).toBe(true);
    expect(matchesFilter(student({ eventId: "event2" }), filter)).toBe(false);
    expect(matchesFilter(student({ eventId: null }), filter)).toBe(false);
  });

  it("filters by whether a registration is still missing answers (US-11, US-13)", () => {
    const chasing = student({ isIncomplete: true });
    const incomplete = withTags(["completeness", COMPLETENESS_VALUES.incomplete]);

    expect(matchesFilter(chasing, incomplete)).toBe(true);
    expect(matchesFilter(ANNA, incomplete)).toBe(false);
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

describe("sameFilter", () => {
  it("ignores the order tags were pressed in, which is no part of what a filter means", () => {
    const one = withTags(["class", "5AHIF"], ["class", "5BHIF"]);
    const other = withTags(["class", "5BHIF"], ["class", "5AHIF"]);

    expect(sameFilter(one, other)).toBe(true);
  });

  it("stops holding as soon as a tag is added or taken away", () => {
    const saved = withTags(["class", "5AHIF"]);

    expect(sameFilter(saved, EMPTY_FILTER)).toBe(false);
    expect(sameFilter(saved, withTags(["class", "5AHIF"], ["gender", "male"]))).toBe(false);
  });

  it("counts the free text too, since it narrows the report just as a tag does", () => {
    expect(sameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, name: "anna" })).toBe(false);
    expect(sameFilter({ ...EMPTY_FILTER, name: " anna " }, { ...EMPTY_FILTER, name: "anna" })).toBe(
      true,
    );
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

  it("offers the events of the season as tags, in the order the teacher set them", () => {
    const events = [
      { id: "event1", name: "Woche 1" },
      { id: "event2", name: "Woche 2" },
    ];

    const [event] = filterGroups(lists, { events }).filter((group) => group.category === "event");

    expect(event.label).toBe("Event");
    expect(event.options).toEqual([
      { value: "event1", label: "Woche 1" },
      { value: "event2", label: "Woche 2" },
    ]);
  });

  // The board's cards are one per event already, so filtering by event inside one says nothing.
  it("leaves the event and completeness categories out unless they are asked for", () => {
    expect(filterGroups(lists).map((group) => group.category)).not.toContain("event");
    expect(filterGroups(lists).map((group) => group.category)).not.toContain("completeness");
  });

  it("puts the report's own categories after the four US-12 gives", () => {
    const events = [{ id: "event1", name: "Woche 1" }];

    expect(
      filterGroups(lists, { attendance: true, completeness: true, events }).map(
        (group) => group.category,
      ),
    ).toEqual(["class", "gender", "program", "skillLevel", "attendance", "event", "completeness"]);
  });

  /** There is nothing to chase about a complete registration, so only the one tag is offered. */
  it("offers a single completeness tag, named the way the master line marks it", () => {
    const [completeness] = filterGroups(lists, { completeness: true }).filter(
      (group) => group.category === "completeness",
    );

    expect(completeness.options).toEqual([
      {
        value: COMPLETENESS_VALUES.incomplete,
        label: INCOMPLETE_REGISTRATION_HINT,
        name: INCOMPLETE_REGISTRATION_HINT,
      },
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

describe("filterSummary", () => {
  const lists = {
    classes: [{ name: "5AHIF" }, { name: "5BHIF" }],
    programs: [{ name: "Ski" }],
    skillLevels: [{ name: "Keine Vorkenntnisse" }],
  };
  const GROUPS = filterGroups(lists, { attendance: true });

  it("names each restricted category and the tags chosen in it", () => {
    const filter = withTags(["class", "5AHIF"], ["class", "5BHIF"], ["gender", "female"]);

    expect(filterSummary(filter, GROUPS)).toBe("Klasse: 5AHIF, 5BHIF · Geschlecht: weiblich");
  });

  it("leaves out a category nothing is chosen in, which restricts nothing", () => {
    expect(filterSummary(withTags(["attendance", ATTENDANCE_VALUES.attending]), GROUPS)).toBe(
      "Teilnahme: nimmt teil",
    );
  });

  it("puts the name being searched for first, since it narrows the most", () => {
    const filter = { ...withTags(["class", "5AHIF"]), name: "Muster" };

    expect(filterSummary(filter, GROUPS)).toBe("Name: Muster · Klasse: 5AHIF");
  });

  it("says nothing about a filter that restricts nothing", () => {
    expect(filterSummary(EMPTY_FILTER, GROUPS)).toBeNull();
  });

  it("passes over a tag no category offers any more, as the row itself does", () => {
    expect(filterSummary(withTags(["class", "3AHME"]), GROUPS)).toBeNull();
  });
});
