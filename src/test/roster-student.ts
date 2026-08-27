/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Registration } from "@/lib/schemas/registration";
import type { RosterStudent } from "@/lib/students/roster";

/**
 * A registration with every answer given, so a test states only the answers it is about.
 * Twenty-four fields is too many to repeat per test file, and a fixture that drifts from the
 * schema fails as a type error in one place rather than in five.
 */
export function studentRecord(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "record1",
    userId: "anna@student.htldornbirn.at",
    eventSeriesId: "s1",
    eventId: null,
    isIncomplete: false,
    isAttendingSportsWeek: true,
    class: "5AHIF",
    program: "Ski",
    skillLevel: "Profi",
    busPickupPoint: "Dornbirn",
    foodOption: "Alles",
    foodOtherText: null,
    seasonPassOption: "Keine",
    dateOfBirth: "2008-04-17",
    gender: "female",
    phoneNumber: "+43 660 1234567",
    emergencyContact: {
      firstName: "Maria",
      lastName: "Muster",
      relationship: "mother",
      relationshipOtherText: null,
      phoneNumber: "+43 660 7654321",
    },
    healthNotes: null,
    hasMedication: false,
    equipmentRentalNeeded: false,
    rentedEquipment: [],
    shoeSize: "42",
    heightCm: 170,
    weightKg: 60,
    ...overrides,
  };
}

/**
 * A roster row whose registration agrees with the projection the filter reads, so a test that
 * sets a class in one place does not have to remember to set it in the other.
 */
export function rosterStudent(
  overrides: Partial<Omit<RosterStudent, "record">> = {},
  answers: Partial<Registration> = {},
): RosterStudent {
  const row = {
    id: "record1",
    userId: "anna@student.htldornbirn.at",
    email: "anna@student.htldornbirn.at",
    firstName: "Anna",
    lastName: "Muster",
    class: "5AHIF",
    gender: "female",
    program: "Ski",
    skillLevel: "Profi",
    isAttending: true,
    isIncomplete: answers.isIncomplete ?? false,
    eventId: null,
    equipmentRentalNeeded: answers.equipmentRentalNeeded ?? false,
    healthNotes: answers.healthNotes ?? null,
    hasMedication: answers.hasMedication ?? false,
    ...overrides,
  } satisfies Omit<RosterStudent, "record">;

  return {
    ...row,
    record: studentRecord({
      id: row.id,
      userId: row.userId,
      eventId: row.eventId,
      isAttendingSportsWeek: row.isAttending,
      isIncomplete: row.isIncomplete,
      class: row.class,
      gender: row.gender,
      program: row.program,
      skillLevel: row.skillLevel,
      equipmentRentalNeeded: row.equipmentRentalNeeded,
      healthNotes: row.healthNotes,
      hasMedication: row.hasMedication,
      ...answers,
    }),
  };
}
