/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { RegistrationInput } from "@/lib/schemas/registration";
import { questionsAsked } from "@/lib/master-data/categories";
import { storedEventSeries } from "@/test/event-series";
import { EQUIPMENT_RENTAL_LABEL } from "./answer-labels";
import { ATTENDANCE_ANSWER_LABEL, isRegistrationIncomplete, missingAnswers } from "./completeness";
import { EMPTY_REGISTRATION } from "./registration";

const complete: RegistrationInput = {
  isAttendingSportsWeek: true,
  program: "Ski",
  skillLevel: "Anfänger",
  busPickupPoint: "HTL Dornbirn",
  foodOption: "Vegetarisch",
  foodOtherText: null,
  seasonPassOption: "Keine",
  dateOfBirth: "2008-05-04",
  gender: "female",
  phoneNumber: "+436601234567",
  emergencyContact: {
    firstName: "Maria",
    lastName: "Doe",
    relationship: "mother",
    relationshipOtherText: null,
    phoneNumber: "+436501234567",
  },
  healthNotes: null,
  hasMedication: false,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

/** A series whose lists are all filled in, so every question it can ask is asked. */
const ALL_ASKED = questionsAsked(
  storedEventSeries({
    events: [{ name: "Woche 1" }],
    classOptions: ["3AHME"],
    programs: [{ name: "Ski", requiredEquipment: [] }],
    skillLevels: ["Anfänger"],
    seasonPassOptions: ["Keine"],
    busPickupPoints: ["HTL Dornbirn"],
    foodOptions: ["Vegetarisch"],
  }),
);

const labelsOf = (input: RegistrationInput, asked = ALL_ASKED) =>
  missingAnswers(input, asked).map((answer) => answer.label);

describe("missingAnswers", () => {
  it("finds nothing missing in a complete registration", () => {
    expect(labelsOf(complete)).toEqual([]);
  });

  /** Answering "no" hides the questions, so an answer nobody is asking for cannot be missing. */
  it("asks nothing of a student who is not attending", () => {
    expect(labelsOf({ ...EMPTY_REGISTRATION, isAttendingSportsWeek: false })).toEqual([]);
  });

  /**
   * Not the same as answering "no". Following the link joins a student (US-23), so the form
   * exists before anything has been said in it, and what they owe is the answer itself.
   */
  it("asks for the attendance answer of a student who has not given one", () => {
    expect(labelsOf({ ...EMPTY_REGISTRATION })).toEqual([ATTENDANCE_ANSWER_LABEL]);
  });

  it.each([
    ["program", "Programm"],
    ["skillLevel", "Leistungsstufe"],
    ["busPickupPoint", "Zustiegsstelle"],
    ["foodOption", "Verpflegung"],
    ["seasonPassOption", "Zugangskarte"],
    ["dateOfBirth", "Geburtsdatum"],
    ["gender", "Geschlecht"],
    ["phoneNumber", "Telefonnummer"],
    ["hasMedication", "Medikamente"],
  ])("names %s as missing", (field, label) => {
    expect(labelsOf({ ...complete, [field]: null })).toEqual([label]);
  });

  it.each([
    ["firstName", "Vorname des Notfallkontakts"],
    ["lastName", "Nachname des Notfallkontakts"],
    ["relationship", "Beziehung des Notfallkontakts"],
    ["phoneNumber", "Telefonnummer des Notfallkontakts"],
  ])("names the emergency contact's %s as missing", (field, label) => {
    const contact = { ...complete.emergencyContact, [field]: null };

    expect(labelsOf({ ...complete, emergencyContact: contact })).toEqual([label]);
  });

  it("asks what the relationship is once it is 'other'", () => {
    const contact = { ...complete.emergencyContact, relationship: "other" as const };

    expect(labelsOf({ ...complete, emergencyContact: contact })).toEqual([
      "Beziehung des Notfallkontakts",
    ]);
  });

  it("asks what the intolerance is once the food option is 'other'", () => {
    expect(labelsOf({ ...complete, foodOption: "other" })).toEqual(["Unverträglichkeit"]);
  });

  it("asks nothing about the rental while the student borrows nothing", () => {
    expect(labelsOf({ ...complete, equipmentRentalNeeded: false })).toEqual([]);
  });

  it("asks for the measurements and the items once the student borrows something", () => {
    const renting = { ...complete, equipmentRentalNeeded: true };

    expect(labelsOf(renting)).toEqual([
      "Schuhgröße",
      "Körpergröße",
      "Gewicht",
      EQUIPMENT_RENTAL_LABEL,
    ]);
  });

  it("stops asking once they are given", () => {
    const renting = {
      ...complete,
      equipmentRentalNeeded: true,
      shoeSize: "42",
      heightCm: 175,
      weightKg: 65,
      rentedEquipment: ["Helm"],
    };

    expect(labelsOf(renting)).toEqual([]);
  });

  it("lists them in the order they are asked, so the list reads like the form", () => {
    const empty = { ...EMPTY_REGISTRATION, isAttendingSportsWeek: true };

    expect(labelsOf(empty).slice(0, 3)).toEqual(["Geburtsdatum", "Geschlecht", "Telefonnummer"]);
  });

  it("says where each answer belongs, so the form can mark the field itself", () => {
    const contact = { ...complete.emergencyContact, lastName: null };

    expect(missingAnswers({ ...complete, emergencyContact: contact }, ALL_ASKED)).toEqual([
      { path: "emergencyContact.lastName", label: "Nachname des Notfallkontakts" },
    ]);
  });

  /**
   * US-21: a Kulturwoche has no skill levels, so it never asks for one — and a question nobody
   * was asked cannot be missing. Without this the mark the report chases students by (US-13)
   * would be stuck on for everybody in that series, over a field they were never shown.
   */
  describe("a question whose list is empty", () => {
    const askedOf = (overrides: Parameters<typeof storedEventSeries>[0]) =>
      questionsAsked(storedEventSeries(overrides));

    const FILLED = {
      programs: [{ name: "Ski", requiredEquipment: [] }],
      skillLevels: ["Anfänger"],
      seasonPassOptions: ["Keine"],
      busPickupPoints: ["HTL Dornbirn"],
      foodOptions: ["Vegetarisch"],
    };

    it.each([
      ["programs", "program"],
      ["skillLevels", "skillLevel"],
      ["seasonPassOptions", "seasonPassOption"],
      ["busPickupPoints", "busPickupPoint"],
      ["foodOptions", "foodOption"],
    ])("is not counted against the student when %s is empty", (list, field) => {
      const asked = askedOf({ ...FILLED, [list]: [] });

      expect(labelsOf({ ...complete, [field]: null }, asked)).toEqual([]);
    });

    it("leaves a series with no lists at all asking only what the student owns", () => {
      const bare = {
        ...complete,
        program: null,
        skillLevel: null,
        seasonPassOption: null,
        busPickupPoint: null,
        foodOption: null,
      };

      expect(labelsOf(bare, askedOf({}))).toEqual([]);
    });

    /** The answers the student owns are always asked, whatever the lists say (US-21, Q4). */
    it("still asks for the date of birth, gender, phone and health", () => {
      const bare = {
        ...complete,
        program: null,
        skillLevel: null,
        seasonPassOption: null,
        busPickupPoint: null,
        foodOption: null,
        dateOfBirth: null,
        hasMedication: null,
      };

      expect(labelsOf(bare, askedOf({}))).toEqual(["Geburtsdatum", "Medikamente"]);
    });
  });
});

describe("isRegistrationIncomplete", () => {
  it("is false once nothing is missing", () => {
    expect(isRegistrationIncomplete(complete, ALL_ASKED)).toBe(false);
  });

  it("is true while an answer is still outstanding", () => {
    expect(isRegistrationIncomplete({ ...complete, gender: null }, ALL_ASKED)).toBe(true);
  });

  /** Otherwise every student in a Kulturwoche would stay marked for a question nobody asked. */
  it("is false where the only unanswered question is one the series does not ask", () => {
    const asked = questionsAsked(storedEventSeries({ programs: [], skillLevels: [] }));
    const bare = {
      ...complete,
      program: null,
      skillLevel: null,
      seasonPassOption: null,
      busPickupPoint: null,
      foodOption: null,
    };

    expect(isRegistrationIncomplete(bare, asked)).toBe(false);
  });
});
