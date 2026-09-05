/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { ANSWER_LABELS, MASTER_DATA_CATEGORIES } from "@/lib/master-data/categories";
import { EQUIPMENT_RENTAL_LABEL } from "@/lib/registration/answer-labels";
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import type { Registration } from "@/lib/schemas/registration";
import { studentRecord } from "@/test/roster-student";
import { event } from "@/test/event-series";
import { fieldTagsFor, NO_ANSWER, REPORT_FIELD_TAGS, reportFieldsOf } from "./report-fields";

const keys = REPORT_FIELD_TAGS.map((tag) => tag.key);

const lineFor = (label: string, record: Registration) => {
  const field = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).find(
    (candidate) => candidate.label === label,
  );
  if (!field) throw new Error(`No report field labelled ${label}`);
  return field.valueOf(record);
};

describe("REPORT_FIELD_TAGS", () => {
  it("offers every field US-13 lists, in the order it lists them", () => {
    expect(keys).toEqual([
      "attendance",
      "class",
      "event",
      "gender",
      "dateOfBirth",
      "contact",
      "program",
      "rentedEquipment",
      "measurements",
      "skillLevel",
      "seasonPassOption",
      "busPickupPoint",
      "food",
      "health",
      "completeness",
    ]);
  });

  /**
   * The menu is where a teacher meets these lists first, so the report reads them back in the
   * order they were filled in. Only the relative order is asserted: the fields row also carries
   * answers no list stands behind, and they sit between these.
   */
  it("lists the answers a teacher's own lists supply in the menu's order (US-5 to US-10)", () => {
    const categoryOfField: Record<string, string> = {
      class: "classes",
      event: "events",
      program: "programs",
      skillLevel: "skill-levels",
      busPickupPoint: "bus-pickup-points",
      food: "food-options",
      seasonPassOption: "season-pass-options",
    };

    const shown = keys.filter((key) => key in categoryOfField).map((key) => categoryOfField[key]);

    expect(shown).toEqual(Object.keys(MASTER_DATA_CATEGORIES));
  });

  /** The word belongs to the category, so a rename there reaches the report without a second edit. */
  it("labels a list-backed field with the word its category owns", () => {
    const labelOf = (key: string) => REPORT_FIELD_TAGS.find((tag) => tag.key === key)?.label;

    expect(labelOf("class")).toBe(ANSWER_LABELS.class);
    expect(labelOf("program")).toBe(ANSWER_LABELS.program);
    expect(labelOf("skillLevel")).toBe(ANSWER_LABELS.skillLevel);
    expect(labelOf("busPickupPoint")).toBe(ANSWER_LABELS.busPickupPoint);
    expect(labelOf("food")).toBe(ANSWER_LABELS.foodOption);
    expect(labelOf("seasonPassOption")).toBe(ANSWER_LABELS.seasonPassOption);
  });

  it("does not offer the e-mail address, which the master line already carries", () => {
    const labels = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).map((field) => field.label);

    expect(labels).not.toContain("E-Mail");
  });

  it("keys every field uniquely, since each one renders a detail line of its own", () => {
    const fields = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).map((field) => field.key);

    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe("reportFieldsOf", () => {
  it("activates nothing while no tag is selected, leaving the master line alone", () => {
    expect(reportFieldsOf([])).toEqual([]);
  });

  it("gives a grouped tag one detail line per field in the group (US-13)", () => {
    expect(reportFieldsOf(["contact"]).map((field) => field.label)).toEqual([
      "Telefonnummer",
      "Notfallkontakt",
      "Beziehung",
      "Telefonnummer des Notfallkontakts",
    ]);
    expect(reportFieldsOf(["measurements"]).map((field) => field.label)).toEqual([
      "Gewicht [kg]",
      "Körpergröße [cm]",
      "Schuhgröße",
    ]);
    expect(reportFieldsOf(["health"]).map((field) => field.label)).toEqual([
      "Krankheiten oder Allergien",
      "Medikamente",
    ]);
  });

  it("keeps the fields in their own order, not in the order the tags were pressed", () => {
    expect(reportFieldsOf(["gender", "attendance"]).map((field) => field.key)).toEqual([
      "attendance",
      "gender",
    ]);
  });

  it("ignores a tag it does not know, so a stale saved selection cannot break the report", () => {
    expect(reportFieldsOf(["nonsense"])).toEqual([]);
  });
});

describe("a field's value", () => {
  it("reads an answer back in the words the form asked it in", () => {
    const record = studentRecord();

    expect(lineFor("Teilnahme", record)).toBe("Ja");
    expect(lineFor("Geschlecht", record)).toBe("Weiblich");
    expect(lineFor("Beziehung", record)).toBe("Mutter");
    expect(lineFor("Medikamente", record)).toBe("Nein");
  });

  it("writes a date the way it is read in German, without leaning on a time zone", () => {
    expect(lineFor("Geburtsdatum", studentRecord({ dateOfBirth: "2008-01-03" }))).toBe(
      "03.01.2008",
    );
  });

  it("names the emergency contact as one person rather than two answers", () => {
    expect(lineFor("Notfallkontakt", studentRecord())).toBe("Maria Muster");
  });

  it("spells out the relationship a student typed in themselves", () => {
    const record = studentRecord({
      emergencyContact: {
        firstName: "Ida",
        lastName: "Muster",
        relationship: "other",
        relationshipOtherText: "Tante",
        phoneNumber: null,
      },
    });

    expect(lineFor("Beziehung", record)).toBe("Tante");
  });

  it("carries the free text of the food option, which is the answer itself (US-9)", () => {
    const record = studentRecord({ foodOption: FOOD_OPTION_OTHER, foodOtherText: "Laktose" });

    expect(lineFor("Verpflegung", record)).toBe("Sonstiges: Laktose");
  });

  it("lists the rented equipment, and says so when nothing is rented", () => {
    expect(
      lineFor(EQUIPMENT_RENTAL_LABEL, studentRecord({ rentedEquipment: ["Ski", "Helm"] })),
    ).toBe("Ski, Helm");
    expect(lineFor(EQUIPMENT_RENTAL_LABEL, studentRecord())).toBe("Nein");
  });

  it("leaves an unanswered field to the placeholder rather than inventing one", () => {
    expect(lineFor("Klasse", studentRecord({ class: null }))).toBeNull();
    expect(lineFor("Geburtsdatum", studentRecord({ dateOfBirth: null }))).toBeNull();
    expect(lineFor("Krankheiten oder Allergien", studentRecord({ healthNotes: null }))).toBeNull();
    expect(NO_ANSWER).toBe("keine Angabe");
  });

  it("states whether the registration is still missing answers (US-11, US-13)", () => {
    expect(lineFor("Registrierung", studentRecord())).toBe("Vollständig");
    expect(lineFor("Registrierung", studentRecord({ isIncomplete: true }))).toBe("Unvollständig");
  });

  // The record holds the name rather than a reference, so the line needs nothing but the record.
  it("names the event a student is assigned to", () => {
    expect(lineFor("Event", studentRecord({ event: "Woche 1" }))).toBe("Woche 1");
  });

  it("leaves the event unanswered while nobody has assigned them a week yet", () => {
    expect(lineFor("Event", studentRecord({ event: null }))).toBeNull();
  });
});

/**
 * An empty list is a question the student was never asked (US-21), so a tag for it would add a
 * detail line reading "keine Angabe" for every student — noise wearing the shape of data.
 */
describe("fieldTagsFor", () => {
  const lists = {
    events: [event("Woche 1")],
    classOptions: ["5AHIF"],
    programs: [{ name: "Ski", requiredEquipment: ["Ski"] }],
    skillLevels: ["Profi"],
    seasonPassOptions: ["Keine"],
    busPickupPoints: ["HTL"],
    foodOptions: ["Vegetarisch"],
  };

  const keysFor = (overrides: Partial<typeof lists> = {}) =>
    fieldTagsFor({ ...lists, ...overrides }).map((tag) => tag.key);

  it("offers every tag to a series that maintains every list", () => {
    expect(keysFor()).toEqual(REPORT_FIELD_TAGS.map((tag) => tag.key));
  });

  it.each([
    ["events", "event"],
    ["classOptions", "class"],
    ["programs", "program"],
    ["skillLevels", "skillLevel"],
    ["seasonPassOptions", "seasonPassOption"],
    ["busPickupPoints", "busPickupPoint"],
    ["foodOptions", "food"],
  ])("drops the tag for %s once the list is empty", (list, key) => {
    expect(keysFor({ [list]: [] })).not.toContain(key);
  });

  /** Renting is asked of a student whose program requires something; here none does. */
  it("drops the rental tag where no program requires anything", () => {
    expect(keysFor({ programs: [{ name: "Wandern", requiredEquipment: [] }] })).not.toContain(
      "rentedEquipment",
    );
  });

  /** Nothing has to be maintained for these to be put to a student, so nothing can take them away. */
  it("keeps the tags no list backs, whatever the series maintains", () => {
    const bare = keysFor({
      events: [],
      classOptions: [],
      programs: [],
      skillLevels: [],
      seasonPassOptions: [],
      busPickupPoints: [],
      foodOptions: [],
    });

    expect(bare).toEqual([
      "attendance",
      "gender",
      "dateOfBirth",
      "contact",
      "measurements",
      "health",
      "completeness",
    ]);
  });
});
