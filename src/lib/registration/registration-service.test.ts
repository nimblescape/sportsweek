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

const { saveRegistration, deleteRegistration, joinEventSeries } =
  await import("./registration-service");
const { ANSWER_NO_LONGER_OFFERED_HINT, REGISTRATION_NOT_OPEN_HINT, registrationPath } =
  await import("./registration");
const { FOOD_OPTION_OTHER } = await import("@/lib/schemas/master-data");
const { ServiceError } = await import("@/lib/service-error");

const STUDENT = "uidJaneDoe";
/** The address that student's record carries, which is a field and never the key (US-31). */
const STUDENT_EMAIL = "jane.doe@student.htldornbirn.at";
const REGISTRATIONS = registrationPath("s1");

/** Where the save is aimed — the one thing the body cannot say. */
function target(overrides: { studentUid?: string; eventSeriesId?: string } = {}) {
  return {
    studentUid: STUDENT,
    eventSeriesId: "s1",
    ...overrides,
  };
}

/** A student coming back to amend what they said (US-23, Q7). */
const returning = target;

beforeEach(() => {
  firestore.reset();
  seedStudent(STUDENT, { firstName: "Jane", lastName: "Doe" });
});

/** Whether the joining is still exactly as the link left it, nothing having been saved into it. */
const unanswered = () => firestore.get(REGISTRATIONS, STUDENT)?.isAttendingSportsWeek === undefined;

/** What following the invitation link leaves behind, which is what a save then amends. */
function seedJoined(className = "3AHME", eventSeriesId = "s1") {
  firestore.seed(registrationPath(eventSeriesId), STUDENT, {
    studentUid: STUDENT,
    class: className,
  });
}
afterEach(() => vi.restoreAllMocks());

/**
 * The name a registration carries is read from the user record rather than sent (US-26), so a
 * student who can save is one the directory has already provisioned (US-1).
 */
function seedStudent(uid: string, name: { firstName: string; lastName: string }) {
  firestore.seed("users", uid, {
    ...name,
    email: `${name.firstName}.${name.lastName}@student.htldornbirn.at`.toLowerCase(),
    accountType: "student",
  });
}

/**
 * Every answer has to be one the series offers (US-27), so the lists a student picks from are
 * part of what makes a series registrable at all. Open unless a test says otherwise: one flag
 * governs the student side, and archiving is excluded by it rather than beside it.
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
  // Following the link joins a student and writes the record (US-23), so a save is always an
  // amendment to one that is already there.
  beforeEach(() => seedJoined());

  it("stores the record beneath the named event series, owned by the student who sent it", async () => {
    seedEventSeries("s1");

    await saveRegistration(target(), attending);

    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({
      studentUid: STUDENT,
      class: "3AHME",
      program: "Ski",
    });
  });

  /** A reader takes the name from the registration and never joins to `users` (US-26). */
  it("copies the student's name and e-mail address off the user record", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record).toMatchObject({ firstName: "Jane", lastName: "Doe", email: STUDENT_EMAIL });
    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: STUDENT_EMAIL,
    });
  });

  it("refuses to save for somebody the directory has never provisioned", async () => {
    seedEventSeries("s1");

    await expect(
      saveRegistration(target({ studentUid: "uidGhost" }), attending),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(unanswered()).toBe(true);
  });

  it("returns the stored record, id and all", async () => {
    seedEventSeries("s1");

    const record = await saveRegistration(target(), attending);

    expect(record).toMatchObject({ id: STUDENT, studentUid: STUDENT });
  });

  /** Which series a registration is in is where it is stored, not a field it carries (US-26). */
  it("stores the record only beneath the series it was aimed at", async () => {
    seedEventSeries("old");
    seedEventSeries("current");
    seedJoined("3AHME", "current");

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
    seedStudent("uidJohnDoe", { firstName: "John", lastName: "Doe" });
    firestore.seed(REGISTRATIONS, "uidJohnDoe", { studentUid: "uidJohnDoe", class: "3AHME" });

    await saveRegistration(target(), attending);
    await saveRegistration(target({ studentUid: "uidJohnDoe" }), attending);

    expect(firestore.count(REGISTRATIONS)).toBe(2);
  });

  /** One flag rather than two: archiving closes, and an archived series cannot be opened (US-19). */
  it("refuses to save into a series that is not open to students", async () => {
    seedEventSeries("s1", { isOpenToStudents: false });

    await expect(saveRegistration(target(), attending)).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(unanswered()).toBe(true);
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
  it("refuses a save into a series the student never joined", async () => {
    seedEventSeries("s2");

    await expect(
      saveRegistration(returning({ eventSeriesId: "s2" }), attending),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: REGISTRATION_NOT_OPEN_HINT,
    });
    expect(unanswered()).toBe(true);
  });

  it("lets a student who has already joined go on amending without their link", async () => {
    seedEventSeries("s1");
    seedJoined();
    await saveRegistration(target(), attending);

    const record = await saveRegistration(returning(), { ...attending, gender: "male" });

    expect(record.class).toBe("3AHME");
  });

  /** Q20: another link is the one way a class changes after registration. */
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
    expect(unanswered()).toBe(true);
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
    expect(unanswered()).toBe(true);
  });

  it("stores nothing when an answer is malformed", async () => {
    seedEventSeries("s1");

    await expect(
      saveRegistration(target(), { ...attending, phoneNumber: "06601234567" }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(unanswered()).toBe(true);
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
      studentUid: "uidSomeoneElse",
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
    seedJoined();
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
    seedJoined();
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

/**
 * A link names a class rather than a student (US-23), so it can reach somebody it was never meant
 * for — and without this, one stray registration would stay in the series for good (US-28).
 */
describe("deleteRegistration", () => {
  const OTHER = "uidMaxMustermann";

  function seedRegistration(uid: string, eventSeriesId = "s1") {
    firestore.seed(registrationPath(eventSeriesId), uid, {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@student.htldornbirn.at",
      class: "3AHME",
      isAttendingSportsWeek: true,
      isIncomplete: false,
    });
  }

  it("removes the registration", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    seedRegistration(STUDENT);

    await deleteRegistration("s1", STUDENT);

    expect(firestore.get(REGISTRATIONS, STUDENT)).toBeUndefined();
  });

  /** The id is derived from the series and the student, so removing one frees it again (US-26). */
  it("lets the same student register again afterwards", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    seedRegistration(STUDENT);

    await deleteRegistration("s1", STUDENT);
    seedJoined();
    await saveRegistration(target(), attending);

    expect(firestore.get(REGISTRATIONS, STUDENT)).toMatchObject({ class: "3AHME" });
  });

  /** The first time the mirror has ever had to go down (Q5); it is what US-19's controls read. */
  it("puts the mirror back to false when the last registration goes", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    seedRegistration(STUDENT);

    await deleteRegistration("s1", STUDENT);

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: false });
  });

  it("leaves the mirror true while another registration remains", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    seedRegistration(STUDENT);
    seedRegistration(OTHER);

    await deleteRegistration("s1", STUDENT);

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: true });
  });

  /** One transaction, or the mirror could be recomputed from a count that has since changed. */
  it("deletes and recomputes the mirror together", async () => {
    seedEventSeries("s1", { hasRegistrations: true });
    seedRegistration(STUDENT);

    await deleteRegistration("s1", STUDENT);

    expect(firestore.transactionCount).toBe(1);
  });

  /** Closing governs students only, so a teacher may still remove one from a closed series. */
  it("removes one from a closed series", async () => {
    seedEventSeries("s1", { hasRegistrations: true, isOpenToStudents: false });
    seedRegistration(STUDENT);

    await deleteRegistration("s1", STUDENT);

    expect(firestore.get(REGISTRATIONS, STUDENT)).toBeUndefined();
  });

  it("refuses one in an archived series, which is read-only", async () => {
    seedEventSeries("s1", { hasRegistrations: true, isArchived: true, isOpenToStudents: false });
    seedRegistration(STUDENT);

    await expect(deleteRegistration("s1", STUDENT)).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get(REGISTRATIONS, STUDENT)).toBeDefined();
  });

  it("refuses one in a series that does not exist", async () => {
    await expect(deleteRegistration("gone", STUDENT)).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuses one that is not there, rather than reporting a deletion it did not make", async () => {
    seedEventSeries("s1", { hasRegistrations: true });

    await expect(deleteRegistration("s1", STUDENT)).rejects.toBeInstanceOf(ServiceError);
  });
});

/**
 * Following the link is what joins a student to an event series (US-23). The record exists from
 * that moment, so what they hold is a fact in the data rather than a token in a cookie — and
 * signing in again finds it by looking, however they arrived.
 */
describe("joinEventSeries", () => {
  it("creates an unanswered registration for the class the link names", async () => {
    seedEventSeries("s1");

    await joinEventSeries("s1", STUDENT, "3AHME");

    expect(firestore.get(registrationPath("s1"), STUDENT)).toMatchObject({
      studentUid: STUDENT,
      firstName: "Jane",
      lastName: "Doe",
      class: "3AHME",
      event: null,
      // Neither yes nor no: joining is not answering, and calling it "no" would file every
      // invited student as having declined.
      isAttendingSportsWeek: null,
      isIncomplete: true,
    });
  });

  /** Following the same link twice is one joining, so the second one takes nothing back. */
  it("leaves an answered registration exactly as it was", async () => {
    seedEventSeries("s1");
    seedJoined();
    await saveRegistration(target(), attending);

    await joinEventSeries("s1", STUDENT, "3AHME");

    expect(firestore.get(registrationPath("s1"), STUDENT)).toMatchObject({
      isAttendingSportsWeek: true,
      program: "Ski",
      class: "3AHME",
    });
  });

  /** Another link, for another class, is how a student's class changes (Q20). */
  it("moves an existing registration to the class the newer link names", async () => {
    seedEventSeries("s1");
    seedJoined();
    await saveRegistration(target(), attending);

    await joinEventSeries("s1", STUDENT, "4AHME");

    expect(firestore.get(registrationPath("s1"), STUDENT)).toMatchObject({
      class: "4AHME",
      isAttendingSportsWeek: true,
    });
  });

  it("tells the event series it now has registrations", async () => {
    seedEventSeries("s1");

    await joinEventSeries("s1", STUDENT, "3AHME");

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: true });
  });

  it("refuses a series that is not open to students", async () => {
    seedEventSeries("s1", { isOpenToStudents: false });

    await expect(joinEventSeries("s1", STUDENT, "3AHME")).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get(registrationPath("s1"), STUDENT)).toBeUndefined();
  });
});
