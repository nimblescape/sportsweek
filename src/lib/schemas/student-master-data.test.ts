/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  emergencyContactSchema,
  studentMasterDataLockedFields,
  studentMasterDataSchema,
} from "@/lib/schemas/student-master-data";

const validContact = {
  firstName: "Maria",
  lastName: "Doe",
  relationship: "mother",
  relationshipOtherText: null,
  phoneNumber: "+436501234567",
};

const validRecord = {
  id: "smd-1",
  userId: "jane.doe@student.htldornbirn.at",
  seasonId: "season-1",
  eventId: null,
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
  emergencyContact: validContact,
  healthNotes: null,
  hasMedication: false,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

describe("studentMasterDataSchema", () => {
  it("parses a valid record", () => {
    expect(studentMasterDataSchema.parse(validRecord)).toEqual(validRecord);
  });

  it("binds the record to its season through a genuine foreign key", () => {
    expect(studentMasterDataSchema.safeParse({ ...validRecord, seasonId: "" }).success).toBe(false);
  });

  it("requires the class even when the student is not attending", () => {
    const notAttending = { ...validRecord, isAttendingSportsWeek: false, class: "" };

    expect(studentMasterDataSchema.safeParse(notAttending).success).toBe(false);
  });

  it("keeps the record unassigned with a null eventId", () => {
    expect(studentMasterDataSchema.parse({ ...validRecord, eventId: null }).eventId).toBeNull();
  });

  it.each(["class", "program", "skillLevel", "busPickupPoint", "foodOption", "seasonPassOption"])(
    "stores %s as plain text rather than a document reference",
    (field) => {
      const withReference = { ...validRecord, [field]: { path: "programs/ski" } };

      expect(studentMasterDataSchema.safeParse(withReference).success).toBe(false);
    },
  );

  it("rejects an invalid gender", () => {
    expect(studentMasterDataSchema.safeParse({ ...validRecord, gender: "diverse" }).success).toBe(
      false,
    );
  });

  it("rejects a national phone number", () => {
    expect(
      studentMasterDataSchema.safeParse({ ...validRecord, phoneNumber: "06601234567" }).success,
    ).toBe(false);
  });

  it("rejects a malformed date of birth", () => {
    expect(
      studentMasterDataSchema.safeParse({ ...validRecord, dateOfBirth: "04.05.2008" }).success,
    ).toBe(false);
  });

  it("requires free text when the food option is 'other'", () => {
    const missingText = { ...validRecord, foodOption: "other", foodOtherText: null };

    expect(studentMasterDataSchema.safeParse(missingText).success).toBe(false);
  });

  it("accepts the food option 'other' together with free text", () => {
    const withText = { ...validRecord, foodOption: "other", foodOtherText: "Nussallergie" };

    expect(studentMasterDataSchema.safeParse(withText).success).toBe(true);
  });

  it("carries the emergency contact on the record itself", () => {
    expect(studentMasterDataSchema.parse(validRecord).emergencyContact).toEqual(validContact);
  });

  it("rejects an emergency contact the contact schema would reject", () => {
    const nationalNumber = { ...validContact, phoneNumber: "06501234567" };

    expect(
      studentMasterDataSchema.safeParse({ ...validRecord, emergencyContact: nationalNumber })
        .success,
    ).toBe(false);
  });

  it("leaves the emergency contact null while the student has not given one", () => {
    const withoutContact = { ...validRecord, emergencyContact: null };

    expect(studentMasterDataSchema.parse(withoutContact).emergencyContact).toBeNull();
  });

  it("carries the rented equipment as names on the record itself", () => {
    const renting = { ...validRecord, equipmentRentalNeeded: true, rentedEquipment: ["Helm"] };

    expect(studentMasterDataSchema.parse(renting).rentedEquipment).toEqual(["Helm"]);
  });

  it("stores a rented item as a snapshot rather than a reference", () => {
    const withReference = { ...validRecord, rentedEquipment: [{ path: "programs/ski" }] };

    expect(studentMasterDataSchema.safeParse(withReference).success).toBe(false);
  });

  it("rejects renting the same item twice", () => {
    const twice = { ...validRecord, rentedEquipment: ["Helm", " helm "] };

    expect(studentMasterDataSchema.safeParse(twice).success).toBe(false);
  });

  it("treats a record stored before the field existed as renting nothing", () => {
    const withoutField = { ...validRecord, rentedEquipment: undefined };

    expect(studentMasterDataSchema.parse(withoutField).rentedEquipment).toEqual([]);
  });
});

describe("studentMasterDataLockedFields", () => {
  it("locks the fields students must never write, so firestore.rules can deny them", () => {
    expect(Object.keys(studentMasterDataLockedFields.shape).sort()).toEqual([
      "eventId",
      "seasonId",
      "userId",
    ]);
  });
});

describe("emergencyContactSchema", () => {
  it("parses a valid contact", () => {
    expect(emergencyContactSchema.parse(validContact)).toEqual(validContact);
  });

  it("rejects an unknown relationship", () => {
    expect(
      emergencyContactSchema.safeParse({ ...validContact, relationship: "uncle" }).success,
    ).toBe(false);
  });

  it("requires free text when the relationship is 'other'", () => {
    const missingText = { ...validContact, relationship: "other", relationshipOtherText: null };

    expect(emergencyContactSchema.safeParse(missingText).success).toBe(false);
  });

  it("requires an international phone number", () => {
    expect(
      emergencyContactSchema.safeParse({ ...validContact, phoneNumber: "06501234567" }).success,
    ).toBe(false);
  });

  it("carries no id of its own, since it lives on the record it belongs to", () => {
    const withId = { ...validContact, id: "ec-1", studentMasterDataId: "smd-1" };

    expect(emergencyContactSchema.parse(withId)).toEqual(validContact);
  });
});
