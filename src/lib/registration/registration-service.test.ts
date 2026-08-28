/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import type { RegistrationInput } from "@/lib/schemas/registration";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { saveRegistration } = await import("./registration-service");
const { ANSWER_NO_LONGER_OFFERED_HINT, REGISTRATION_NOT_OPEN_HINT, registrationPath } =
  await import("./registration");
const { FOOD_OPTION_OTHER } = await import("@/lib/schemas/master-data");
const { ServiceError } = await import("@/lib/service-error");

const STUDENT = "jane.doe@student.htldornbirn.at";
const REGISTRATIONS = registrationPath("s1");

/** Where the save is aimed and what the link enrols into — the two things the body cannot say. */
function target(
  overrides: { studentUpn?: string; eventSeriesId?: string; invitedClass?: string } = {},
) {
  return {
    studentUpn: STUDENT,
    eventSeriesId: "s1",
    invitedClass: "3AHME",
    ...overrides,
  };
}

/** A student coming back to amend what they said: signed in, holding no link (US-23, Q7). */
function returning(overrides: { studentUpn?: string; eventSeriesId?: string } = {}) {
  return { ...target(overrides), invitedClass: null };
}

beforeEach(() => {
  firestore.reset();
  seedStudent(STUDENT, { firstName: "Jane", lastName: "Doe" });
});
afterEach(() => vi.restoreAllMocks());

/**
 * The name a registration carries is read from the user record rather than sent (US-26), so a
 * student who can save is one the directory has already provisioned (US-1).
 */
function seedStudent(upn: string, name: { firstName: string; lastName: string }) {
  firestore.seed("users", upn, { ...name, email: upn, role: "student" });
}

/**
 * Every answer has to be one the series offers (US-27), so the lists a student picks from are
 * part of what makes a series registrable at all. Open unless a test says otherwise: one flag
 * governs the student side, and archiving and templates are excluded by it rather than beside it.
 */
function seedEventSeries(id: string, fields: Record<string, unknown> = {}) {
  firestore.seed(
    "eventSeries",
    id,
    storedEventSeries({
      name: `Eventreihe ${id}`,
      isOpenToStudents: true,
      classOptions: ["3AHME", "4AHME"],
      programs: [{ name: "Ski", requiredEquipment: [] }],
      skillLevels: ["Anfänger"],
      seasonPassOptions: ["Keine"],
      busPickupPoints: ["HTL Dornbirn"],
      foodOptions: ["Vegetarisch"],
      ...fields,
    }),
  );
}

const attending: RegistrationInput = {
  isAttendingSportsWeek: true,
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

describe("saveRegistration", () => {
  it("stores the record beneath the named event series, owned by the student who sent it", async () => {
    seedEventSeries("s1");

    await saveRegistration(target(), attending);

    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({
      studentUpn: STUDENT,
      class: "3AHME",
      program: "Ski",
    });
  });

  /** A reader takes the name from the registration and never joins to `users` (US-26). */
  it("copies the student's name and e-mail address off the user record", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record).toMatchObject({ firstName: "Jane", lastName: "Doe", email: STUDENT });
    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: STUDENT,
    });
  });

  it("refuses to save for somebody the directory has never provisioned", async () => {
    seedEventSeries("s1");

    await expect(
      saveRegistration(target({ studentUpn: "ghost@student.htldornbirn.at" }), attending),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  it("returns the stored record, id and all", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record).toMatchObject({ id: STUDENT, studentUpn: STUDENT });
  });

  /** Which series a registration is in is where it is stored, not a field it carries (US-26). */
  it("stores the record only beneath the series it was aimed at", async () => {
    seedEventSeries("old");
    seedEventSeries("current");

    await saveRegistration(target({ eventSeriesId: "current" }), attending);

    expect(firestore.count(registrationPath("current"))).toBe(1);
    expect(firestore.count(registrationPath("old"))).toBe(0);
  });

  it("updates the record a second save produces instead of adding another one", async () => {
    seedEventSeries("s1");

    await saveRegistration(target(), attending);
    await saveRegistration(returning(), { ...attending, gender: "male" });

    expect(firestore.count(REGISTRATIONS)).toBe(1);
    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({ gender: "male" });
  });

  it("keeps one record per student per event series", async () => {
    seedEventSeries("s1");
    seedStudent("john@student.htldornbirn.at", { firstName: "John", lastName: "Doe" });

    await saveRegistration(target(), attending);
    await saveRegistration(target({ studentUpn: "john@student.htldornbirn.at" }), attending);

    expect(firestore.count(REGISTRATIONS)).toBe(2);
  });

  /** One flag rather than two: archiving closes, and an archived series cannot be opened (US-19). */
  it("refuses to save into a series that is not open to students", async () => {
    seedEventSeries("s1", { isOpenToStudents: false });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  it("refuses to save into a series that does not exist, saying no more than that", async () => {
    await expect(
      saveRegistration(target({ eventSeriesId: "gone" }), attending),
    ).rejects.toMatchObject({ code: "CONFLICT", message: REGISTRATION_NOT_OPEN_HINT });
  });

  /**
   * The link is how a student joins (US-23), so naming an open series is not enough to get into
   * one: without a link there is no class to give the record, and a class is never an answer.
   */
  it("refuses a first save by a student holding no link for that series", async () => {
    seedEventSeries("s1");

    await expect(saveRegistration(returning(), attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  it("lets a student who has already joined go on amending without their link", async () => {
    seedEventSeries("s1");
    await saveRegistration(target(), attending);

    const record = await saveRegistration(returning(), { ...attending, gender: "male" });

    expect(record.class).toBe("3AHME");
  });

  /** Q20: another link is the one way a class changes after registration. */
  it("moves the student to the class a newer link names", async () => {
    seedEventSeries("s1");
    await saveRegistration(target(), attending);

    const record = await saveRegistration(target({ invitedClass: "4AHME" }), attending);

    expect(record.class).toBe("4AHME");
  });

  /**
   * The other half of closing the in-use race (US-27): the series is read inside this save's own
   * transaction, so a teacher removing an option makes the save conflict, retry, and be refused
   * here rather than storing a value the series no longer offers.
   */
  it("refuses an answer the event series no longer offers", async () => {
    seedEventSeries("s1", { programs: [{ name: "Snowboard", requiredEquipment: [] }] });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: ANSWER_NO_LONGER_OFFERED_HINT,
    });
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  it("asks the student to reload rather than storing an answer nothing offers", async () => {
    seedEventSeries("s1", { skillLevels: ["Profi"] });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      message: ANSWER_NO_LONGER_OFFERED_HINT,
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: false });
  });

  it("checks every list-backed answer, not only the one the form asks first", async () => {
    seedEventSeries("s1", { busPickupPoints: ["Bregenz"] });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      message: ANSWER_NO_LONGER_OFFERED_HINT,
    });
  });

  /** A class a link still names has to be one the series offers, like every other list value. */
  it("checks the class the link named, not only the answers", async () => {
    seedEventSeries("s1", { classOptions: ["1AHME"] });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      message: ANSWER_NO_LONGER_OFFERED_HINT,
    });
  });

  /** An empty list asks no question (US-21), so leaving it unanswered is not an unoffered answer. */
  it("lets a question the event series no longer asks stay unanswered", async () => {
    seedEventSeries("s1", { seasonPassOptions: [] });

    const record = await saveRegistration(target(), { ...attending, seasonPassOption: null });

    expect(record.seasonPassOption).toBeNull();
  });

  /** "Sonstiges" is never a row a teacher keeps, but it is offered beside a non-empty list (US-9). */
  it("accepts the free-text food choice while the food list has rows to offer", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), {
      ...attending,
      foodOption: FOOD_OPTION_OTHER,
      foodOtherText: "Laktosefrei",
    });

    expect(record.foodOption).toBe(FOOD_OPTION_OTHER);
  });

  it("refuses the free-text food choice where the food question is not asked at all", async () => {
    seedEventSeries("s1", { foodOptions: [] });

    await expect(
      saveRegistration(target(), {
        ...attending,
        foodOption: FOOD_OPTION_OTHER,
        foodOtherText: "Laktosefrei",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: ANSWER_NO_LONGER_OFFERED_HINT });
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  it("stores nothing when an answer is malformed", async () => {
    seedEventSeries("s1");

    await expect(
      saveRegistration(target(), { ...attending, phoneNumber: "06601234567" }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count(REGISTRATIONS)).toBe(0);
  });

  /** A registration is filled in over time, so an unanswered question is not a failed save. */
  it("stores a registration the student has not finished", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), { ...attending, program: null });

    expect(record.program).toBeNull();
  });

  it("marks a registration that is still missing answers (US-13)", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), { ...attending, gender: null });

    expect(record.isIncomplete).toBe(true);
    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({ isIncomplete: true });
  });

  it("clears the mark once nothing is missing", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record.isIncomplete).toBe(false);
  });

  /** The client cannot be the judge of it: the report marks students by this (US-13). */
  it("works the mark out itself rather than taking it from the client", async () => {
    seedEventSeries("s1");
    const claimed = { ...attending, gender: null, isIncomplete: false };

    await expect(saveRegistration(target(), claimed as RegistrationInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("reports which field was wrong, so the form can point at it", async () => {
    seedEventSeries("s1");

    await expect(
      saveRegistration(target(), { ...attending, phoneNumber: "06601234567" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a record that names a student or a name of its own", async () => {
    seedEventSeries("s1");
    const smuggled = {
      ...attending,
      studentUpn: "someone.else@htldornbirn.at",
      firstName: "Someone",
    };

    await expect(saveRegistration(target(), smuggled as RegistrationInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  /** The class is the server's (US-23), so a student picking their own is refused, not ignored. */
  it("refuses a record that names a class of its own", async () => {
    seedEventSeries("s1");
    const smuggled = { ...attending, class: "4AHME" };

    await expect(saveRegistration(target(), smuggled as RegistrationInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("stores list values as plain text, trimmed the way the lists compare them", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), { ...attending, skillLevel: "  Anfänger  " });

    expect(record.skillLevel).toBe("Anfänger");
  });

  it("starts out unassigned, since assigning is the teacher's to do (US-12)", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record.event).toBeNull();
  });

  it("leaves an existing event assignment alone while the student is attending", async () => {
    seedEventSeries("s1");
    await saveRegistration(target(), attending);
    firestore.seed(REGISTRATIONS, STUDENT, {
      ...firestore.get(REGISTRATIONS, STUDENT),
      event: "Woche 1",
    });

    const record = await saveRegistration(returning(), { ...attending, gender: "male" });

    expect(record.event).toBe("Woche 1");
  });

  it("gives up the event assignment when the student answers 'no' (US-11)", async () => {
    seedEventSeries("s1");
    await saveRegistration(target(), attending);
    firestore.seed(REGISTRATIONS, STUDENT, {
      ...firestore.get(REGISTRATIONS, STUDENT),
      event: "Woche 1",
    });

    const record = await saveRegistration(returning(), {
      ...attending,
      isAttendingSportsWeek: false,
    });

    expect(record.event).toBeNull();
  });

  it("keeps the values a student entered before answering 'no'", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), {
      ...attending,
      isAttendingSportsWeek: false,
    });

    expect(record).toMatchObject({ program: "Ski", skillLevel: "Anfänger" });
  });

  it("mirrors onto the event series that it now holds registrations (US-19)", async () => {
    seedEventSeries("s1");

    await saveRegistration(target(), attending);

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: true });
  });

  it("writes the record and the mirror together, so neither can land without the other", async () => {
    seedEventSeries("s1");
    const writes = vi.spyOn(firestore, "applyWrite");

    await saveRegistration(target(), attending);

    expect(firestore.transactionCount).toBe(1);
    expect(writes.mock.calls.map(([write]) => write.ref.path)).toEqual([
      `${REGISTRATIONS}/${STUDENT}`,
      "eventSeries/s1",
    ]);
  });

  it("leaves the mirror alone once it already says so", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    const writes = vi.spyOn(firestore, "applyWrite");

    await saveRegistration(target(), attending);

    expect(writes.mock.calls.map(([write]) => write.ref.path)).toEqual([
      `${REGISTRATIONS}/${STUDENT}`,
    ]);
  });
});
