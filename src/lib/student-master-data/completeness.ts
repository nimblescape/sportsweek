/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import type { StudentMasterDataInput } from "@/lib/schemas/student-master-data";

/**
 * The answers a registration needs before a teacher can plan with it, in the order the form
 * asks for them (US-11).
 *
 * These are short nouns rather than the questions the fields carry: they are read as a list of
 * what is left to do, where "Programm" says more at a glance than "Für welches Programm meldest
 * du dich an?" would.
 */
const ATTENDING_ANSWERS = [
  ["dateOfBirth", "Geburtsdatum"],
  ["gender", "Geschlecht"],
  ["phoneNumber", "Telefonnummer"],
  ["program", "Programm"],
  ["skillLevel", "Leistungsstufe"],
  ["seasonPassOption", "Saisonkarte"],
  ["busPickupPoint", "Zustiegsstelle"],
  ["foodOption", "Verpflegung"],
  ["hasMedication", "Medikamente"],
] as const satisfies readonly (readonly [keyof StudentMasterDataInput, string])[];

const CONTACT_ANSWERS = [
  ["firstName", "Vorname des Notfallkontakts"],
  ["lastName", "Nachname des Notfallkontakts"],
  ["relationship", "Beziehung des Notfallkontakts"],
  ["phoneNumber", "Telefonnummer des Notfallkontakts"],
] as const satisfies readonly (readonly [
  keyof StudentMasterDataInput["emergencyContact"],
  string,
])[];

const RENTAL_ANSWERS = [
  ["shoeSize", "Schuhgröße"],
  ["heightCm", "Körpergröße"],
  ["weightKg", "Gewicht"],
] as const satisfies readonly (readonly [keyof StudentMasterDataInput, string])[];

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/** Where the answer belongs in the form, and what to call it in a list of what is left. */
export type MissingAnswer = { path: string; label: string };

/**
 * What the student has not answered yet.
 *
 * A registration is filled in over time and can be saved at any point, so this is what the
 * student is told rather than what stops them (US-11). The class is asked of everyone; the rest
 * only of a student who is attending, since answering "no" is what takes those questions away.
 */
export function missingAnswers(input: StudentMasterDataInput): MissingAnswer[] {
  const missing: MissingAnswer[] = [];

  if (isBlank(input.class)) missing.push({ path: "class", label: "Klasse" });
  if (!input.isAttendingSportsWeek) return missing;

  for (const [field, label] of ATTENDING_ANSWERS) {
    if (isBlank(input[field])) missing.push({ path: field, label });
  }

  const contact = input.emergencyContact;
  for (const [field, label] of CONTACT_ANSWERS) {
    if (isBlank(contact[field])) missing.push({ path: `emergencyContact.${field}`, label });
  }
  if (contact.relationship === "other" && isBlank(contact.relationshipOtherText)) {
    missing.push({
      path: "emergencyContact.relationshipOtherText",
      label: "Beziehung des Notfallkontakts",
    });
  }

  if (input.foodOption === FOOD_OPTION_OTHER && isBlank(input.foodOtherText)) {
    missing.push({ path: "foodOtherText", label: "Unverträglichkeit" });
  }

  if (input.equipmentRentalNeeded === true) {
    for (const [field, label] of RENTAL_ANSWERS) {
      if (isBlank(input[field])) missing.push({ path: field, label });
    }
    if (input.rentedEquipment.length === 0) {
      missing.push({ path: "rentedEquipment", label: "Ausrüstung zum Ausleihen" });
    }
  }

  return missing;
}

/**
 * Mirrored onto the record on every save, so the report can tell at a glance whose registration
 * a teacher still has to chase (US-13) without re-deriving it per student.
 */
export function isRegistrationIncomplete(input: StudentMasterDataInput): boolean {
  return missingAnswers(input).length > 0;
}
