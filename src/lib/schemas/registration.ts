/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import {
  genderSchema,
  hasUniqueNames,
  isoDateSchema,
  optionalText,
  phoneNumberSchema,
  requiredText,
  snapshotValueSchema,
  uidSchema,
} from "./common";
import { MAX_EQUIPMENT_ITEMS } from "./master-data";

export const relationshipSchema = z.enum(["mother", "father", "other"]);
export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * Carried on the record rather than in a record of its own: a student has exactly one, it has
 * no identity outside the registration, and nothing else refers to it (US-11).
 *
 * Its fields are individually optional for the same reason the record's are: answering "no"
 * hides them without clearing them, so a half-filled contact has to survive being saved.
 * Which of them are required, and when, is decided in `registrationInputSchema`.
 */
export const emergencyContactSchema = z.object({
  firstName: requiredText(100).nullable(),
  lastName: requiredText(100).nullable(),
  relationship: relationshipSchema.nullable(),
  relationshipOtherText: optionalText(200),
  phoneNumber: phoneNumberSchema.nullable(),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const EMPTY_EMERGENCY_CONTACT: EmergencyContact = {
  firstName: null,
  lastName: null,
  relationship: null,
  relationshipOtherText: null,
  phoneNumber: null,
};

/**
 * The entries of the selected program's required equipment the student rents (US-5, US-11),
 * snapshotted by name like every other list value. On the record for the same reason as the
 * contact, and because a rental has no meaning without the registration it belongs to.
 */
export const rentedEquipmentSchema = z
  .array(snapshotValueSchema)
  .max(MAX_EQUIPMENT_ITEMS, `Höchstens ${MAX_EQUIPMENT_ITEMS} Einträge.`)
  .refine(hasUniqueNames, "Jeder Ausrüstungsgegenstand darf nur einmal vorkommen.");

const registrationFields = z.object({
  id: uidSchema,
  /**
   * The one reference this record keeps, and the reason it keeps it: the access rules have to be
   * able to say "yours" about a registration, and a record naming nobody could be owned by
   * nobody (US-26). It is also the document's own id, so a student's registration in a series is
   * reached without a query.
   */
  studentUid: uidSchema,
  /**
   * Copied from the session on every save and refreshed at every login (US-1, US-26), so a
   * reader needs no join: the report, the board, the overview and both exports read the name
   * from here. Which event series a registration belongs to is where it is stored, not a field.
   */
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: requiredText(320),
  /**
   * Teacher-managed assignment (US-12); null means unassigned. The event is named rather than
   * pointed at, like every other value chosen from one of the series' lists (US-11, US-21).
   */
  event: snapshotValueSchema.nullable(),
  /**
   * Null until the student answers. Following the link is what joins them (US-23), so a
   * registration exists before anything has been said in it — and a boolean would have to call
   * that silence a refusal, which would file every invited student as having declined.
   */
  isAttendingSportsWeek: z.boolean().nullable(),
  /**
   * Set from the invitation link the student joined through, never answered (US-23). A student
   * who picked their own would sometimes pick the wrong one, and the class is the dimension the
   * per-class cards, the assignment board and every grouped figure are built on (US-12, US-13) —
   * so one mistyped choice would quietly falsify two classes' numbers with nothing to show it.
   */
  class: snapshotValueSchema.nullable(),
  gender: genderSchema.nullable(),
  dateOfBirth: isoDateSchema.nullable(),
  phoneNumber: phoneNumberSchema.nullable(),
  // Defaulted like the rented equipment: records written before the field existed carry none.
  emergencyContact: emergencyContactSchema.default(EMPTY_EMERGENCY_CONTACT),
  program: snapshotValueSchema.nullable(),
  equipmentRentalNeeded: z.boolean().nullable(),
  // Defaulted, because records written before the field existed simply rent nothing.
  rentedEquipment: rentedEquipmentSchema.default([]),
  weightKg: z.number().positive().max(400).nullable(),
  heightCm: z.number().int().positive().max(300).nullable(),
  shoeSize: requiredText(10).nullable(),
  skillLevel: snapshotValueSchema.nullable(),
  seasonPassOption: snapshotValueSchema.nullable(),
  busPickupPoint: snapshotValueSchema.nullable(),
  foodOption: snapshotValueSchema.nullable(),
  foodOtherText: optionalText(500),
  healthNotes: optionalText(2000),
  hasMedication: z.boolean().nullable(),
});

/**
 * Every answer is optional, on purpose. A registration is filled in over time and saved as
 * often as the student likes, so the schema's job is to reject what is *malformed* — a phone
 * number that is not one, a date that is not one — never what is merely unanswered. Which
 * answers a registration still needs is a question for `completeness.ts`, which tells the
 * student rather than blocking them (US-11).
 */
export const registrationSchema = registrationFields;
export type Registration = z.infer<typeof registrationSchema>;

/** Set by the server on every save, so a student naming one of them is refused outright. */
const SERVER_OWNED = {
  studentUid: true,
  firstName: true,
  lastName: true,
  email: true,
  event: true,
  class: true,
} as const;

/** Keep in sync with the student denylist in firestore.rules — students must never write these. */
export const registrationLockedFields = registrationFields.pick(SERVER_OWNED);

/**
 * What a student may send. Derived from the record so a field added there cannot be forgotten
 * here, minus the id and everything the server owns — which is why the object is strict: a
 * smuggled name is a mistake worth reporting, not one worth silently dropping.
 */
export const registrationInputSchema = registrationFields
  .omit({ id: true, ...SERVER_OWNED })
  // Required rather than defaulted here: the default exists for records written before the
  // field did, and a save always sends the whole registration anyway.
  .extend({ rentedEquipment: rentedEquipmentSchema, emergencyContact: emergencyContactSchema })
  .strict();
export type RegistrationInput = z.infer<typeof registrationInputSchema>;
