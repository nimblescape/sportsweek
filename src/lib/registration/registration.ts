/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Registration, RegistrationInput } from "@/lib/schemas/registration";
import { EMPTY_EMERGENCY_CONTACT } from "@/lib/schemas/registration";

/**
 * A student holds exactly one record per event series, so the id is derived from both rather than
 * generated: document ids are unique by construction, which turns "does one exist yet?" into a
 * single-document read on the client and on the server alike (US-11).
 */
export function recordIdFor(eventSeriesId: string, userId: string): string {
  return `${eventSeriesId}__${userId}`;
}

/**
 * Shown instead of the form while registering is not possible yet. Both halves are the teacher's
 * to set up and neither is anything the student can act on, so they read the same: an event series to
 * belong to (US-4) and a class to pick from (US-6) are equally missing pieces of one setup.
 */
export const REGISTRATION_NOT_OPEN_HINT = "Es ist noch keine Sportveranstaltung freigeschalten.";

/** What an unsaved registration looks like, before the student has answered anything. */
export const EMPTY_REGISTRATION: RegistrationInput = {
  // Taking part and borrowing equipment are answers the student gives, not ones the form
  // assumes on their behalf — so both start on "no".
  isAttendingSportsWeek: false,
  class: "",
  program: null,
  skillLevel: null,
  busPickupPoint: null,
  foodOption: null,
  foodOtherText: null,
  seasonPassOption: null,
  dateOfBirth: null,
  gender: null,
  phoneNumber: null,
  emergencyContact: EMPTY_EMERGENCY_CONTACT,
  healthNotes: null,
  hasMedication: null,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

/**
 * The stored record as the form and the endpoint speak of it: everything the student owns, and
 * nothing the server does. Derived from the empty registration's keys so a field added to one
 * cannot be forgotten in the other.
 */
export function toRegistrationInput(record: Registration): RegistrationInput {
  const fields = Object.keys(EMPTY_REGISTRATION) as (keyof RegistrationInput)[];

  return Object.fromEntries(fields.map((field) => [field, record[field]])) as RegistrationInput;
}

/**
 * Holds the rental answers to what the selected program actually requires (US-11). The form
 * keeps the boxes a student ticked for a program they have since switched away from, which is
 * the right thing on screen and the wrong thing to store: a rented name is what holds a teacher
 * back from removing that equipment (US-5).
 */
export function scopeRentalToProgram(
  values: RegistrationInput,
  programEquipment: readonly string[],
): RegistrationInput {
  if (programEquipment.length === 0) {
    return { ...values, equipmentRentalNeeded: null, rentedEquipment: [] };
  }
  if (values.equipmentRentalNeeded !== true) {
    return { ...values, rentedEquipment: [] };
  }
  return {
    ...values,
    rentedEquipment: values.rentedEquipment.filter((name) => programEquipment.includes(name)),
  };
}
