/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import {
  documentIdSchema,
  genderSchema,
  isoDateSchema,
  optionalText,
  phoneNumberSchema,
  requiredText,
  snapshotValueSchema,
} from "./common";
import { FOOD_OPTION_OTHER } from "./master-data";

export const relationshipSchema = z.enum(["mother", "father", "other"]);
export type Relationship = z.infer<typeof relationshipSchema>;

const emergencyContactFields = z.object({
  id: documentIdSchema,
  studentMasterDataId: documentIdSchema,
  firstName: requiredText(100),
  lastName: requiredText(100),
  relationship: relationshipSchema,
  relationshipOtherText: optionalText(200),
  phoneNumber: phoneNumberSchema,
});

export const emergencyContactSchema = emergencyContactFields.refine(
  (contact) =>
    contact.relationship !== "other" || (contact.relationshipOtherText?.trim().length ?? 0) > 0,
  { message: "Bitte die Beziehung angeben.", path: ["relationshipOtherText"] },
);
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const equipmentRentalItemSchema = z.object({
  id: documentIdSchema,
  studentMasterDataId: documentIdSchema,
  itemName: snapshotValueSchema,
});
export type EquipmentRentalItem = z.infer<typeof equipmentRentalItemSchema>;

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
  healthNotes: optionalText(2000),
  hasMedication: z.boolean().nullable(),
  equipmentRentalNeeded: z.boolean().nullable(),
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
