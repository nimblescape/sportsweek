/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import {
  ANSWER_LABELS,
  MASTER_DATA_CATEGORIES,
  type AnswerField,
} from "@/lib/master-data/categories";
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import type { RegistrationInput } from "@/lib/schemas/registration";
import { EQUIPMENT_RENTAL_LABEL } from "./answer-labels";

/** The answers a list supplies, as against the ones the student owns and is always asked for. */
const LIST_BACKED = new Set<string>(
  Object.values(MASTER_DATA_CATEGORIES).map((category) => category.usage.field),
);

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
  ["program", ANSWER_LABELS.program],
  ["skillLevel", ANSWER_LABELS.skillLevel],
  ["seasonPassOption", ANSWER_LABELS.seasonPassOption],
  ["busPickupPoint", ANSWER_LABELS.busPickupPoint],
  ["foodOption", ANSWER_LABELS.foodOption],
  ["hasMedication", "Medikamente"],
] as const satisfies readonly (readonly [keyof RegistrationInput, string])[];

const CONTACT_ANSWERS = [
  ["firstName", "Vorname des Notfallkontakts"],
  ["lastName", "Nachname des Notfallkontakts"],
  ["relationship", "Beziehung des Notfallkontakts"],
  ["phoneNumber", "Telefonnummer des Notfallkontakts"],
] as const satisfies readonly (readonly [keyof RegistrationInput["emergencyContact"], string])[];

const RENTAL_ANSWERS = [
  ["shoeSize", "Schuhgröße"],
  ["heightCm", "Körpergröße"],
  ["weightKg", "Gewicht"],
] as const satisfies readonly (readonly [keyof RegistrationInput, string])[];

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/** Where the answer belongs in the form, and what to call it in a list of what is left. */
export type MissingAnswer = { path: string; label: string };

/**
 * What the student has not answered yet.
 *
 * A registration is filled in over time and can be saved at any point, so this is what the
 * student is told rather than what stops them (US-11). Only a student who is attending is asked
 * anything at all, since answering "no" is what takes the questions away — and the class, the
 * one thing asked of everybody before, is now set by the link rather than answered (US-23).
 *
 * `asked` is what the series' own lists supply (US-21). Without it a Kulturwoche with no skill
 * levels would mark every registration in it incomplete for good, over a question its students
 * were never shown — and `isIncomplete` is what the report chases them by (US-13).
 */
export function missingAnswers(
  input: RegistrationInput,
  asked: ReadonlySet<AnswerField>,
): MissingAnswer[] {
  const missing: MissingAnswer[] = [];

  if (!input.isAttendingSportsWeek) return missing;

  for (const [field, label] of ATTENDING_ANSWERS) {
    if (LIST_BACKED.has(field) && !asked.has(field as AnswerField)) continue;
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
      missing.push({ path: "rentedEquipment", label: EQUIPMENT_RENTAL_LABEL });
    }
  }

  return missing;
}

/**
 * Mirrored onto the record on every save, so the report can tell at a glance whose registration
 * a teacher still has to chase (US-13) without re-deriving it per student.
 */
export function isRegistrationIncomplete(
  input: RegistrationInput,
  asked: ReadonlySet<AnswerField>,
): boolean {
  return missingAnswers(input, asked).length > 0;
}
