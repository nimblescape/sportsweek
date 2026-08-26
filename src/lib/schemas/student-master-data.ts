/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import {
  documentIdSchema,
  genderSchema,
  hasUniqueNames,
  isoDateSchema,
  optionalText,
  phoneNumberSchema,
  requiredText,
  snapshotValueSchema,
} from "./common";
import { FOOD_OPTION_OTHER } from "./master-data";

export const relationshipSchema = z.enum(["mother", "father", "other"]);
export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * Carried on the record rather than in a record of its own: a student has exactly one, it has
 * no identity outside the registration, and nothing else refers to it (US-11).
 */
export const emergencyContactSchema = z
  .object({
    firstName: requiredText(100),
    lastName: requiredText(100),
    relationship: relationshipSchema,
    relationshipOtherText: optionalText(200),
    phoneNumber: phoneNumberSchema,
  })
  .refine(
    (contact) =>
      contact.relationship !== "other" || (contact.relationshipOtherText?.trim().length ?? 0) > 0,
    { message: "Bitte die Beziehung angeben.", path: ["relationshipOtherText"] },
  );
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/**
 * The entries of the selected program's required equipment the student rents (US-5, US-11),
 * snapshotted by name like every other list value. On the record for the same reason as the
 * contact, and because a rental has no meaning without the registration it belongs to.
 */
export const rentedEquipmentSchema = z
  .array(snapshotValueSchema)
  .max(50, "Höchstens 50 Einträge.")
  .refine(hasUniqueNames, "Jeder Ausrüstungsgegenstand darf nur einmal vorkommen.");

const studentMasterDataFields = z.object({
  id: documentIdSchema,
  userId: documentIdSchema,
  // The only genuine reference on this record: it makes the archived state derivable (US-4, US-11).
  seasonId: documentIdSchema,
  // Teacher-managed assignment (US-12); null means unassigned.
  eventId: documentIdSchema.nullable(),
  isAttendingSportsWeek: z.boolean(),
  // Required regardless of attendance (US-11).
  class: snapshotValueSchema,
  program: snapshotValueSchema.nullable(),
  skillLevel: snapshotValueSchema.nullable(),
  busPickupPoint: snapshotValueSchema.nullable(),
  foodOption: snapshotValueSchema.nullable(),
  foodOtherText: optionalText(500),
  seasonPassOption: snapshotValueSchema.nullable(),
  dateOfBirth: isoDateSchema.nullable(),
  gender: genderSchema.nullable(),
  phoneNumber: phoneNumberSchema.nullable(),
  emergencyContact: emergencyContactSchema.nullable(),
  healthNotes: optionalText(2000),
  hasMedication: z.boolean().nullable(),
  equipmentRentalNeeded: z.boolean().nullable(),
  // Defaulted, because records written before the field existed simply rent nothing.
  rentedEquipment: rentedEquipmentSchema.default([]),
  shoeSize: requiredText(10).nullable(),
  heightCm: z.number().int().positive().max(300).nullable(),
  weightKg: z.number().positive().max(400).nullable(),
});

export const studentMasterDataSchema = studentMasterDataFields.refine(
  (record) =>
    record.foodOption !== FOOD_OPTION_OTHER || (record.foodOtherText?.trim().length ?? 0) > 0,
  { message: "Bitte die Unverträglichkeit angeben.", path: ["foodOtherText"] },
);
export type StudentMasterData = z.infer<typeof studentMasterDataSchema>;

/** Keep in sync with the student denylist in firestore.rules — students must never write these. */
export const studentMasterDataLockedFields = studentMasterDataFields.pick({
  userId: true,
  seasonId: true,
  eventId: true,
});
