/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import type { StudentMasterDataInput } from "@/lib/schemas/student-master-data";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { saveStudentMasterData } = await import("./student-master-data-service");
const { REGISTRATION_NOT_OPEN_HINT, recordIdFor } = await import("./registration");
const { ServiceError } = await import("@/lib/service-error");

const STUDENT = "jane.doe@student.htldornbirn.at";
const RECORD_ID = recordIdFor("s1", STUDENT);

beforeEach(() => {
  firestore.reset();
  // Registering needs a class to pick from as much as it needs a season (US-6, US-11).
  firestore.seed("classOptions", "c1", { name: "3AHME", position: 0 });
});

function seedSeason(id: string, fields: Record<string, unknown> = {}) {
  firestore.seed("seasons", id, {
    name: `Saison ${id}`,
    isActive: false,
    isArchived: false,
    hasStudentData: false,
    position: 0,
    ...fields,
  });
}

const attending: StudentMasterDataInput = {
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
  emergencyContact: {
    firstName: "Maria",
    lastName: "Doe",
    relationship: "mother",
    relationshipOtherText: null,
    phoneNumber: "+436501234567",
  },
  healthNotes: null,
  hasMedication: false,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

describe("saveStudentMasterData", () => {
  it("stores the record for the active season, owned by the student who sent it", async () => {
    seedSeason("s1", { isActive: true });

    await saveStudentMasterData(STUDENT, attending);

    expect(firestore.get("studentMasterData", RECORD_ID)).toMatchObject({
      userId: STUDENT,
      seasonId: "s1",
      class: "3AHME",
      program: "Ski",
    });
  });

  it("returns the stored record, id and all", async () => {
    seedSeason("s1", { isActive: true });

    const record = await saveStudentMasterData(STUDENT, attending);

    expect(record).toMatchObject({ id: RECORD_ID, userId: STUDENT, seasonId: "s1" });
  });

  it("binds the record to the active season, not to one the student names", async () => {
    seedSeason("old");
    seedSeason("current", { isActive: true });

    const record = await saveStudentMasterData(STUDENT, attending);

    expect(record.seasonId).toBe("current");
  });

  it("updates the record a second save produces instead of adding another one", async () => {
    seedSeason("s1", { isActive: true });

    await saveStudentMasterData(STUDENT, attending);
    await saveStudentMasterData(STUDENT, { ...attending, class: "4AHME" });

    expect(firestore.count("studentMasterData")).toBe(1);
    expect(firestore.get("studentMasterData", RECORD_ID)).toMatchObject({ class: "4AHME" });
  });

  it("keeps one record per student per season", async () => {
    seedSeason("s1", { isActive: true });

    await saveStudentMasterData(STUDENT, attending);
    await saveStudentMasterData("john@student.htldornbirn.at", attending);

    expect(firestore.count("studentMasterData")).toBe(2);
  });

  it("refuses to save while no season is active", async () => {
    seedSeason("s1");

    await expect(saveStudentMasterData(STUDENT, attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(firestore.count("studentMasterData")).toBe(0);
  });

  /** The class is asked of every student, attending or not, so a list without one is unusable. */
  it("refuses to save while the teacher has set up no class to pick from", async () => {
    firestore.reset();
    seedSeason("s1", { isActive: true });

    await expect(saveStudentMasterData(STUDENT, attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(firestore.count("studentMasterData")).toBe(0);
  });

  it("stores nothing when the input does not hold together", async () => {
    seedSeason("s1", { isActive: true });

    await expect(
      saveStudentMasterData(STUDENT, { ...attending, program: null }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("studentMasterData")).toBe(0);
  });

  it("reports which field was wrong, so the form can point at it", async () => {
    seedSeason("s1", { isActive: true });

    await expect(
      saveStudentMasterData(STUDENT, { ...attending, phoneNumber: "06601234567" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a record that names a season or a student of its own", async () => {
    seedSeason("s1", { isActive: true });
    const smuggled = { ...attending, seasonId: "other", userId: "someone.else@htldornbirn.at" };

    await expect(
      saveStudentMasterData(STUDENT, smuggled as StudentMasterDataInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("stores list values as plain text, trimmed the way the lists compare them", async () => {
    seedSeason("s1", { isActive: true });

    const record = await saveStudentMasterData(STUDENT, { ...attending, class: "  3AHME  " });

    expect(record.class).toBe("3AHME");
  });

  it("starts out unassigned, since assigning is the teacher's to do (US-12)", async () => {
    seedSeason("s1", { isActive: true });

    const record = await saveStudentMasterData(STUDENT, attending);

    expect(record.eventId).toBeNull();
  });

  it("leaves an existing event assignment alone while the student is attending", async () => {
    seedSeason("s1", { isActive: true });
    await saveStudentMasterData(STUDENT, attending);
    firestore.seed("studentMasterData", RECORD_ID, {
      ...firestore.get("studentMasterData", RECORD_ID),
      eventId: "event1",
    });

    const record = await saveStudentMasterData(STUDENT, { ...attending, class: "4AHME" });

    expect(record.eventId).toBe("event1");
  });

  it("gives up the event assignment when the student answers 'no' (US-11)", async () => {
    seedSeason("s1", { isActive: true });
    await saveStudentMasterData(STUDENT, attending);
    firestore.seed("studentMasterData", RECORD_ID, {
      ...firestore.get("studentMasterData", RECORD_ID),
      eventId: "event1",
    });

    const record = await saveStudentMasterData(STUDENT, {
      ...attending,
      isAttendingSportsWeek: false,
    });

    expect(record.eventId).toBeNull();
  });

  it("keeps the values a student entered before answering 'no'", async () => {
    seedSeason("s1", { isActive: true });

    const record = await saveStudentMasterData(STUDENT, {
      ...attending,
      isAttendingSportsWeek: false,
    });

    expect(record).toMatchObject({ program: "Ski", skillLevel: "Anfänger" });
  });

  it("mirrors onto the season that it now holds student data (US-4)", async () => {
    seedSeason("s1", { isActive: true });

    await saveStudentMasterData(STUDENT, attending);

    expect(firestore.get("seasons", "s1")).toMatchObject({ hasStudentData: true });
  });

  it("writes the record and the mirror together, so neither can land without the other", async () => {
    seedSeason("s1", { isActive: true });

    await saveStudentMasterData(STUDENT, attending);

    expect(firestore.batchSizes).toEqual([2]);
  });

  it("leaves the mirror alone once it already says so", async () => {
    seedSeason("s1", { isActive: true, hasStudentData: true });

    await saveStudentMasterData(STUDENT, attending);

    expect(firestore.batchSizes).toEqual([1]);
  });
});
