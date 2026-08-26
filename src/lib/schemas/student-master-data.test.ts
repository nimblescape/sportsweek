/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { MAX_EQUIPMENT_ITEMS } from "@/lib/schemas/master-data";
import {
  emergencyContactSchema,
  studentMasterDataInputSchema,
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
  isIncomplete: false,
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

  it("stores a registration whose class has not been picked yet", () => {
    const started = { ...validRecord, isAttendingSportsWeek: false, class: null };

    expect(studentMasterDataSchema.parse(started).class).toBeNull();
  });

  it("marks a record the student has not finished, for the report to pick up (US-13)", () => {
    expect(studentMasterDataSchema.parse({ ...validRecord, isIncomplete: true }).isIncomplete).toBe(
      true,
    );
  });

  it("treats a record stored before that flag existed as unfinished", () => {
    expect(
      studentMasterDataSchema.parse({ ...validRecord, isIncomplete: undefined }).isIncomplete,
    ).toBe(true);
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

  it("stores the food option 'other' before the free text has been written", () => {
    const missingText = { ...validRecord, foodOption: "other", foodOtherText: null };

    expect(studentMasterDataSchema.safeParse(missingText).success).toBe(true);
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

  it("leaves the emergency contact empty while the student has not given one", () => {
    const withoutContact = { ...validRecord, emergencyContact: undefined };

    expect(studentMasterDataSchema.parse(withoutContact).emergencyContact).toEqual({
      firstName: null,
      lastName: null,
      relationship: null,
      relationshipOtherText: null,
      phoneNumber: null,
    });
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

  it("rejects renting more items than a program can require", () => {
    const tooMany = Array.from({ length: MAX_EQUIPMENT_ITEMS + 1 }, (_, index) => `Teil ${index}`);

    expect(
      studentMasterDataSchema.safeParse({ ...validRecord, rentedEquipment: tooMany }).success,
    ).toBe(false);
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
      "isIncomplete",
      "seasonId",
      "userId",
    ]);
  });
});

describe("studentMasterDataInputSchema", () => {
  const attending = {
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

  const parse = (input: Record<string, unknown>) => studentMasterDataInputSchema.safeParse(input);

  it("accepts a complete registration", () => {
    expect(parse(attending).success).toBe(true);
  });

  it.each(["id", "userId", "seasonId", "eventId", "isIncomplete"])(
    "refuses to take %s from the student, since the server owns it",
    (field) => {
      expect(parse({ ...attending, [field]: "smuggled" }).success).toBe(false);
    },
  );

  /**
   * Every answer is optional here on purpose: a registration is filled in over time and saved
   * as often as the student likes, so the schema rejects what is malformed, never what is
   * merely unanswered. Which answers are still needed is `completeness.ts`, which tells the
   * student instead of blocking them (US-11).
   */
  it("accepts a registration that has barely been started", () => {
    const empty = {
      ...attending,
      class: null,
      program: null,
      skillLevel: null,
      busPickupPoint: null,
      foodOption: null,
      seasonPassOption: null,
      dateOfBirth: null,
      gender: null,
      phoneNumber: null,
      emergencyContact: {
        firstName: null,
        lastName: null,
        relationship: null,
        relationshipOtherText: null,
        phoneNumber: null,
      },
      hasMedication: null,
    };

    expect(parse(empty).success).toBe(true);
  });

  it("accepts the food option 'other' before the free text has been written", () => {
    expect(parse({ ...attending, foodOption: "other" }).success).toBe(true);
  });

  it("accepts a rental before its measurements have been given", () => {
    expect(parse({ ...attending, equipmentRentalNeeded: true }).success).toBe(true);
  });

  it("keeps the values a student entered before answering 'no'", () => {
    expect(parse({ ...attending, isAttendingSportsWeek: false }).success).toBe(true);
  });

  it.each([
    ["phoneNumber", "06601234567"],
    ["dateOfBirth", "04.05.2008"],
    ["gender", "diverse"],
    ["heightCm", -1],
  ])("still rejects a malformed %s", (field, value) => {
    expect(parse({ ...attending, [field]: value }).success).toBe(false);
  });

  it("accepts a rental with its measurements", () => {
    const renting = {
      ...attending,
      equipmentRentalNeeded: true,
      rentedEquipment: ["Helm", "Ski"],
      shoeSize: "42",
      heightCm: 175,
      weightKg: 65,
    };

    expect(parse(renting).success).toBe(true);
  });

  it("leaves the rental fields alone while nothing is rented", () => {
    expect(parse({ ...attending, equipmentRentalNeeded: null }).success).toBe(true);
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

  /** When each field becomes required is the input schema's call, not the stored shape's. */
  it("stores a contact the student has only started filling in", () => {
    const halfFilled = { ...validContact, lastName: null, phoneNumber: null };

    expect(emergencyContactSchema.parse(halfFilled)).toEqual(halfFilled);
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
