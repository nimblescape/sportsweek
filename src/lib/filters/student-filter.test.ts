/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_RENTAL_LABEL,
  HEALTH_LABEL,
  HEALTH_NOTED_LABEL,
  INCOMPLETE_REGISTRATION_HINT,
  NO_EQUIPMENT_RENTAL_LABEL,
} from "@/lib/registration/answer-labels";
import {
  ATTENDANCE_VALUES,
  COMPLETENESS_VALUES,
  EMPTY_FILTER,
  EQUIPMENT_RENTAL_VALUES,
  HEALTH_VALUES,
  clearTags,
  filterGroups,
  filterStudents,
  filterSummary,
  hasNoTags,
  matchesFilter,
  sameFilter,
  scopeFilterToGroups,
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
    equipmentRentalNeeded: false,
    healthNotes: null,
    hasMedication: false,
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

  it("filters by whether equipment is rented at all, not by which items (US-11, US-13)", () => {
    const renting = student({ equipmentRentalNeeded: true });
    const needed = withTags(["equipmentRental", EQUIPMENT_RENTAL_VALUES.needed]);
    const notNeeded = withTags(["equipmentRental", EQUIPMENT_RENTAL_VALUES.notNeeded]);

    expect(matchesFilter(renting, needed)).toBe(true);
    expect(matchesFilter(ANNA, needed)).toBe(false);
    expect(matchesFilter(ANNA, notNeeded)).toBe(true);
  });

  // Unanswered, or a programme that asks for no equipment at all, which stores the same null.
  it("leaves a student who was never asked about renting out of both rental tags", () => {
    const unasked = student({ equipmentRentalNeeded: null });

    expect(matchesFilter(unasked, withTags(["equipmentRental", EQUIPMENT_RENTAL_VALUES.needed]))).toBe(false); // prettier-ignore
    expect(matchesFilter(unasked, withTags(["equipmentRental", EQUIPMENT_RENTAL_VALUES.notNeeded]))).toBe(false); // prettier-ignore
  });

  it("finds a student with a health note written down (US-11, US-13)", () => {
    const noted = withTags(["health", HEALTH_VALUES.noted]);

    expect(matchesFilter(student({ healthNotes: "Asthma" }), noted)).toBe(true);
    expect(matchesFilter(ANNA, noted)).toBe(false);
  });

  it("finds a student who carries medication, whether or not anything is written down", () => {
    const noted = withTags(["health", HEALTH_VALUES.noted]);

    expect(matchesFilter(student({ hasMedication: true }), noted)).toBe(true);
    expect(matchesFilter(student({ healthNotes: "Asthma", hasMedication: true }), noted)).toBe(
      true,
    );
  });

  // A field a student opened and left blank is a field with nothing written in it.
  it("treats a health note of nothing but space as nothing written down", () => {
    const noted = withTags(["health", HEALTH_VALUES.noted]);

    expect(matchesFilter(student({ healthNotes: "   " }), noted)).toBe(false);
    expect(matchesFilter(student({ hasMedication: null }), noted)).toBe(false);
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

  it("offers the events of the event series as tags, in the order the teacher set them", () => {
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
    expect(filterGroups(lists).map((group) => group.category)).not.toContain("equipmentRental");
    expect(filterGroups(lists).map((group) => group.category)).not.toContain("health");
  });

  it("puts the report's own categories after the four US-12 gives", () => {
    const events = [{ id: "event1", name: "Woche 1" }];

    expect(
      filterGroups(lists, {
        attendance: true,
        completeness: true,
        equipmentRental: true,
        health: true,
        events,
      }).map((group) => group.category),
    ).toEqual([
      "class",
      "gender",
      "program",
      "skillLevel",
      "attendance",
      "event",
      "equipmentRental",
      "health",
      "completeness",
    ]);
  });

  /** Nothing to look out for is simply everyone else, so only the one tag is offered. */
  it("offers a single health tag, naming what it gathers rather than the category", () => {
    const [health] = filterGroups(lists, { health: true }).filter(
      (group) => group.category === "health",
    );

    expect(health.label).toBe(HEALTH_LABEL);
    expect(health.options).toEqual([{ value: HEALTH_VALUES.noted, label: HEALTH_NOTED_LABEL }]);
  });

  /** Both tags are worded so they read on their own, in a row that carries no headings. */
  it("offers renting and not renting as the two equipment tags (US-11, US-13)", () => {
    const [rental] = filterGroups(lists, { equipmentRental: true }).filter(
      (group) => group.category === "equipmentRental",
    );

    expect(rental.label).toBe(EQUIPMENT_RENTAL_LABEL);
    expect(rental.options).toEqual([
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
    ]);
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

describe("scopeFilterToGroups", () => {
  const GROUPS = filterGroups(
    {
      classes: [{ name: "5AHIF" }],
      programs: [{ name: "Ski" }],
      skillLevels: [{ name: "Keine Vorkenntnisse" }],
    },
    { attendance: true },
  );

  it("keeps the tags the categories still offer", () => {
    const filter = withTags(["class", "5AHIF"], ["program", "Ski"]);

    expect(scopeFilterToGroups(filter, GROUPS)).toEqual(filter);
  });

  it("drops a tag whose option is gone, rather than filtering to nobody by something invisible", () => {
    const filter = withTags(["class", "5AHIF"], ["class", "3AHME"]);

    expect(scopeFilterToGroups(filter, GROUPS).tags.class).toEqual(["5AHIF"]);
  });

  it("drops every tag of a category nothing offers at all", () => {
    const filter = withTags(["event", "event1"]);

    expect(scopeFilterToGroups(filter, GROUPS).tags.event).toEqual([]);
  });

  it("leaves the name being searched for alone, which no list has to offer", () => {
    const filter = { ...withTags(["class", "3AHME"]), name: "Muster" };

    expect(scopeFilterToGroups(filter, GROUPS).name).toBe("Muster");
  });
});

describe("filterSummary", () => {
  const lists = {
    classes: [{ name: "5AHIF" }, { name: "5BHIF" }],
    programs: [{ name: "Ski" }],
    skillLevels: [{ name: "Keine Vorkenntnisse" }],
  };
  const GROUPS = filterGroups(lists, { attendance: true });

  it("lists the tags chosen, grouped by the category they were chosen in", () => {
    const filter = withTags(["class", "5AHIF"], ["class", "5BHIF"], ["gender", "female"]);

    expect(filterSummary(filter, GROUPS)).toBe("5AHIF, 5BHIF \u00b7 weiblich");
  });

  it("leaves out a category nothing is chosen in, which restricts nothing", () => {
    expect(filterSummary(withTags(["attendance", ATTENDANCE_VALUES.attending]), GROUPS)).toBe(
      "nimmt teil",
    );
  });

  it("puts the name being searched for first, and says that is what it is", () => {
    const filter = { ...withTags(["class", "5AHIF"]), name: "Muster" };

    expect(filterSummary(filter, GROUPS)).toBe("Name: Muster · 5AHIF");
  });

  it("says nothing about a filter that restricts nothing", () => {
    expect(filterSummary(EMPTY_FILTER, GROUPS)).toBeNull();
  });

  it("passes over a tag no category offers any more, as the row itself does", () => {
    expect(filterSummary(withTags(["class", "3AHME"]), GROUPS)).toBeNull();
  });
});
