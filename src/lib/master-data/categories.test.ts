/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import {
  ANSWER_LABELS,
  CHILD_IN_USE_HINT,
  IN_USE_HINT,
  MASTER_DATA_CATEGORIES,
  masterDataSections,
  masterDataCategorySchema,
  type AnswerField,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";

/**
 * Every category and the registration field it is matched against, so the in-use rule covers all
 * of them alike. A full `Record` of the key union rather than a handful named by hand: a category
 * left out of the list this way does not compile, which is what kept `events` out of the rule
 * while it read as covered.
 */
const SNAPSHOT_FIELDS: Record<MasterDataCategoryKey, AnswerField> = {
  events: "event",
  classes: "class",
  programs: "program",
  "skill-levels": "skillLevel",
  "season-pass-options": "seasonPassOption",
  "bus-pickup-points": "busPickupPoint",
  "food-options": "foodOption",
};

describe("MASTER_DATA_CATEGORIES", () => {
  it("points every category at a list the event series document holds", () => {
    const stored = eventSeriesSchema.shape;

    for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
      expect(Object.keys(stored)).toContain(category.field);
      expect(stored[category.field].parse(undefined)).toEqual([]);
    }
  });

  it.each(Object.entries(SNAPSHOT_FIELDS))(
    "matches %s against the registration field it snapshots into",
    (key, field) => {
      expect(MASTER_DATA_CATEGORIES[key as MasterDataCategoryKey].usage).toEqual({
        kind: "masterData",
        field,
      });
    },
  );

  it("names the field a program keeps its required equipment in, and gives nothing else one", () => {
    const programs: MasterDataCategory = MASTER_DATA_CATEGORIES.programs;
    const classes: MasterDataCategory = MASTER_DATA_CATEGORIES.classes;

    expect(programs.equipmentField).toBe("requiredEquipment");
    expect(classes.equipmentField).toBeUndefined();
  });

  it("has no category of its own for required equipment, which is a field now", () => {
    expect(Object.keys(MASTER_DATA_CATEGORIES)).not.toContain("required-equipment");
  });

  it("labels every category in German", () => {
    for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
      expect(category.labels.title).not.toBe("");
      expect(category.labels.singular).not.toBe("");
      expect(category.labels.add).toMatch(/^Neue/);
      expect(category.labels.answer).not.toBe("");
    }
  });
});

describe("ANSWER_LABELS", () => {
  it("names every list's answer, under the field that stores it", () => {
    expect(ANSWER_LABELS).toEqual({
      event: "Event",
      class: "Klasse",
      program: "Programm",
      skillLevel: "Leistungsstufe",
      busPickupPoint: "Zustiegsstelle",
      foodOption: "Verpflegung",
      seasonPassOption: "Zugangskarte",
    });
  });

  /** One adds an option to a "Verpflegungsoption" list and answers a question about "Verpflegung". */
  it("is not simply the singular, which names a row rather than the answer", () => {
    expect(MASTER_DATA_CATEGORIES["food-options"].labels.singular).toBe("Verpflegungsoption");
    expect(ANSWER_LABELS.foodOption).toBe("Verpflegung");
  });
});

describe("masterDataSections", () => {
  const sections = masterDataSections("s1");

  it("leads with the event series list and adds nothing beyond the categories", () => {
    expect(sections[0]).toEqual({ href: "/app/event-series", label: "Eventreihen" });
    expect(sections).toHaveLength(Object.keys(MASTER_DATA_CATEGORIES).length + 1);
  });

  /** A student is asked their class before their program, and the menu is read in that order. */
  it("puts the menu in the order a teacher works through it", () => {
    expect(sections.map((section) => section.label)).toEqual([
      "Eventreihen",
      "Events",
      "Klassen",
      "Programme",
      "Leistungsstufen",
      "Zugangskarten",
      "Zustiegsstellen",
      "Verpflegung",
    ]);
  });

  it("links each category beneath the selected event series", () => {
    for (const [key, category] of Object.entries(MASTER_DATA_CATEGORIES)) {
      expect(sections).toContainEqual({
        href: `/app/s1/master-data/${key}`,
        label: category.labels.title,
      });
    }
  });

  /** An id is opaque and never typed, but a path segment it corrupted would be silent. */
  it("encodes the event series id it builds the paths from", () => {
    expect(masterDataSections("a/b")[1].href).toBe("/app/a%2Fb/master-data/events");
  });

  /** With no series selected the six lists have nothing to be about, so only the list itself is offered. */
  it("offers the event series list alone when nothing is selected", () => {
    expect(masterDataSections(null)).toEqual([{ href: "/app/event-series", label: "Eventreihen" }]);
  });
});

describe("masterDataCategorySchema", () => {
  it("accepts every known key", () => {
    for (const key of Object.keys(MASTER_DATA_CATEGORIES) as MasterDataCategoryKey[]) {
      expect(masterDataCategorySchema.safeParse(key).success).toBe(true);
    }
  });

  it("rejects an unknown key, so a URL segment cannot name a collection", () => {
    expect(masterDataCategorySchema.safeParse("users").success).toBe(false);
    expect(masterDataCategorySchema.safeParse("../users").success).toBe(false);
  });
});

/**
 * These sentences were written when the lists were global and shared across seasons, so an
 * archived one put its registrations beyond the guard's reach. Each list now belongs to one
 * event series (US-21) and the guard reads that series' own registrations — and archiving makes
 * a series read-only (US-19), so advising it is advising the one thing that cannot help.
 */
describe("the in-use hints", () => {
  it.each([IN_USE_HINT, CHILD_IN_USE_HINT])(
    "does not send the teacher off to archive anything: %s",
    (hint) => {
      expect(hint).not.toMatch(/archivier/i);
    },
  );

  it("says which registrations hold an entry back, since only this series' can", () => {
    expect(IN_USE_HINT).toMatch(/dieser Eventreihe/);
  });
});
