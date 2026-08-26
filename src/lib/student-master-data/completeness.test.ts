/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { StudentMasterDataInput } from "@/lib/schemas/student-master-data";
import { isRegistrationIncomplete, missingAnswers } from "./completeness";
import { EMPTY_REGISTRATION } from "./registration";

const complete: StudentMasterDataInput = {
  isAttendingSportsWeek: true,
  class: "3AHME",
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

const labelsOf = (input: StudentMasterDataInput) =>
  missingAnswers(input).map((answer) => answer.label);

describe("missingAnswers", () => {
  it("finds nothing missing in a complete registration", () => {
    expect(labelsOf(complete)).toEqual([]);
  });

  it("asks for the class of a student who is not attending, and for nothing else", () => {
    expect(labelsOf({ ...EMPTY_REGISTRATION })).toEqual(["Klasse"]);
  });

  /** Answering "no" hides the rest, so an answer nobody is asking for cannot be missing. */
  it("counts nothing else against a student who is not attending", () => {
    const notAttending = { ...EMPTY_REGISTRATION, class: "3AHME" };

    expect(labelsOf(notAttending)).toEqual([]);
  });

  it.each([
    ["class", "Klasse"],
    ["program", "Programm"],
    ["skillLevel", "Leistungsstufe"],
    ["busPickupPoint", "Zustiegsstelle"],
    ["foodOption", "Verpflegung"],
    ["seasonPassOption", "Saisonkarte"],
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
      "Ausrüstung zum Ausleihen",
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

    expect(labelsOf(empty).slice(0, 3)).toEqual(["Klasse", "Geburtsdatum", "Geschlecht"]);
  });

  it("says where each answer belongs, so the form can mark the field itself", () => {
    const contact = { ...complete.emergencyContact, lastName: null };

    expect(missingAnswers({ ...complete, emergencyContact: contact })).toEqual([
      { path: "emergencyContact.lastName", label: "Nachname des Notfallkontakts" },
    ]);
  });
});

describe("isRegistrationIncomplete", () => {
  it("is false once nothing is missing", () => {
    expect(isRegistrationIncomplete(complete)).toBe(false);
  });

  it("is true while an answer is still outstanding", () => {
    expect(isRegistrationIncomplete({ ...complete, gender: null })).toBe(true);
  });
});
