/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Registration, RegistrationInput } from "@/lib/schemas/registration";
import { EMPTY_EMERGENCY_CONTACT } from "@/lib/schemas/registration";
import { COLLECTIONS } from "@/lib/schemas/collections";

/**
 * Where a student's registration for one event series lives. The series is the path and the UPN
 * is the document id, so "does one exist yet?" is a single-document read rather than a query,
 * and a student can hold exactly one per series by construction (US-11, US-26).
 */
export function registrationPath(eventSeriesId: string): string {
  return `${COLLECTIONS.eventSeries}/${eventSeriesId}/${COLLECTIONS.registrations}`;
}

/**
 * Shown instead of the form while registering is not possible yet. Both halves are the teacher's
 * to set up and neither is anything the student can act on, so they read the same: an event series to
 * belong to (US-4) and a class to pick from (US-6) are equally missing pieces of one setup.
 */
export const REGISTRATION_NOT_OPEN_HINT = "Es ist noch keine Sportveranstaltung freigeschalten.";

/**
 * Shown when an answer names something the event series stopped offering while the form was
 * open — a teacher removed it between the page being loaded and the save being sent. It asks for
 * the one thing that helps, since the form the student is looking at is out of date.
 */
export const ANSWER_NO_LONGER_OFFERED_HINT =
  "Eine der gewählten Optionen steht nicht mehr zur Verfügung. " +
  "Bitte lade die Seite neu und wähle erneut.";

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
