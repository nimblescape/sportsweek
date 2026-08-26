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
import { FOOD_OPTION_OTHER, MAX_EQUIPMENT_ITEMS } from "./master-data";

export const relationshipSchema = z.enum(["mother", "father", "other"]);
export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * Carried on the record rather than in a record of its own: a student has exactly one, it has
 * no identity outside the registration, and nothing else refers to it (US-11).
 *
 * Its fields are individually optional for the same reason the record's are: answering "no"
 * hides them without clearing them, so a half-filled contact has to survive being saved.
 * Which of them are required, and when, is decided in `studentMasterDataInputSchema`.
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
  // Defaulted like the rented equipment: records written before the field existed carry none.
  emergencyContact: emergencyContactSchema.default(EMPTY_EMERGENCY_CONTACT),
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

/** Set by the server on every save, so a student naming one of them is refused outright. */
const SERVER_OWNED = { userId: true, seasonId: true, eventId: true } as const;

/** Keep in sync with the student denylist in firestore.rules — students must never write these. */
export const studentMasterDataLockedFields = studentMasterDataFields.pick(SERVER_OWNED);

const REQUIRED_WHEN_ATTENDING = [
  "program",
  "skillLevel",
  "busPickupPoint",
  "foodOption",
  "seasonPassOption",
  "dateOfBirth",
  "gender",
  "phoneNumber",
  "hasMedication",
] as const;

const CONTACT_REQUIRED_WHEN_ATTENDING = [
  "firstName",
  "lastName",
  "relationship",
  "phoneNumber",
] as const;

const MISSING = "Pflichtfeld.";

/**
 * What a student may send. Derived from the record so a field added there cannot be forgotten
 * here, minus the id and everything the server owns — which is why the object is strict: a
 * smuggled `seasonId` is a mistake worth reporting, not one worth silently dropping.
 *
 * Requiredness is conditional rather than baked into the field types: only the class is asked
 * of a student who is not attending, and the values they entered before answering "no" are kept
 * rather than cleared (US-11), so a half-filled registration has to remain saveable.
 */
export const studentMasterDataInputSchema = studentMasterDataFields
  .omit({ id: true, ...SERVER_OWNED })
  // Required rather than defaulted here: the default exists for records written before the
  // field did, and a save always sends the whole registration anyway.
  .extend({ rentedEquipment: rentedEquipmentSchema, emergencyContact: emergencyContactSchema })
  .strict()
  .superRefine((input, context) => {
    if (!input.isAttendingSportsWeek) return;

    for (const field of REQUIRED_WHEN_ATTENDING) {
      if (input[field] === null) {
        context.addIssue({ code: "custom", message: MISSING, path: [field] });
      }
    }

    for (const field of CONTACT_REQUIRED_WHEN_ATTENDING) {
      if (input.emergencyContact[field] === null) {
        context.addIssue({ code: "custom", message: MISSING, path: ["emergencyContact", field] });
      }
    }

    const contact = input.emergencyContact;
    if (
      contact.relationship === "other" &&
      (contact.relationshipOtherText?.trim().length ?? 0) === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Bitte die Beziehung angeben.",
        path: ["emergencyContact", "relationshipOtherText"],
      });
    }

    if (input.foodOption === FOOD_OPTION_OTHER && (input.foodOtherText?.trim().length ?? 0) === 0) {
      context.addIssue({
        code: "custom",
        message: "Bitte die Unverträglichkeit angeben.",
        path: ["foodOtherText"],
      });
    }

    if (input.equipmentRentalNeeded !== true) return;

    for (const field of ["shoeSize", "heightCm", "weightKg"] as const) {
      if (input[field] === null) {
        context.addIssue({ code: "custom", message: MISSING, path: [field] });
      }
    }

    if (input.rentedEquipment.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Bitte mindestens einen Ausrüstungsgegenstand auswählen.",
        path: ["rentedEquipment"],
      });
    }
  });
export type StudentMasterDataInput = z.infer<typeof studentMasterDataInputSchema>;
