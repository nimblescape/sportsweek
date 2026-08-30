/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";

const docGet = vi.fn();
const docSet = vi.fn();
const docUpdate = vi.fn();
const loginAdd = vi.fn();
const logins = vi.fn(() => ({ add: loginAdd }));
const doc = vi.fn(() => ({
  get: docGet,
  set: docSet,
  update: docUpdate,
  collection: logins,
}));
// Whether anybody already teaches here, which is what decides the first teacher's roles (US-2).
const teachersGet = vi.fn();
const limit = vi.fn(() => ({ get: teachersGet }));
const where = vi.fn(() => ({ limit }));
const collection = vi.fn(() => ({ doc, where }));
const setCustomUserClaims = vi.fn();
const fetchEntraName = vi.fn();
const fetchEntraPhoto = vi.fn();

// A school that already has one, so a test says so itself when it means to be the first.
teachersGet.mockResolvedValue({ empty: false });

/**
 * The user record stays a mock, so the tests below can stage a login that finds one or does
 * not. The registrations are a real store: what the refresh has to get right is which documents
 * a collection group query reaches and which series each of them sits beneath (US-26).
 */
const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection,
    collectionGroup: (id: string) => firestore.collectionGroup(id),
    batch: () => firestore.batch(),
  },
  adminAuth: { setCustomUserClaims },
}));

vi.mock("@/lib/auth/graph", () => ({ fetchEntraName, fetchEntraPhoto }));

// Whatever else a deployment refuses. Production refuses nothing, so the tests below say so
// explicitly rather than leaning on which module the build happens to resolve.
const refuseSignIn = vi.fn();
vi.mock("@/lib/auth/sign-in-policy", () => ({ refuseSignIn }));

const { provisionUser } = await import("@/lib/auth/provision-user");
const { registrationPath } = await import("@/lib/registration/registration");

const teacherClaims = {
  uid: "firebase-uid-1",
  email: "jane.doe@htldornbirn.at",
  given_name: "Jane",
  family_name: "Doe",
};

function existingRecord(data: Record<string, unknown>) {
  docGet.mockResolvedValue({ exists: true, data: () => data });
}

const ENTRA = { firebase: { sign_in_provider: "microsoft.com" } };
const IMPERSONATED = { firebase: { sign_in_provider: "custom" } };

const studentClaims = {
  uid: "firebase-uid-2",
  email: "max.mustermann@student.htldornbirn.at",
  given_name: "Max",
  family_name: "Mustermann",
};

/**
 * Which sign-ins are refused is the policy's business, not this function's. What belongs here
 * is that a refusal is asked for, and honoured when one comes back.
 */
describe("the deployment's own sign-in policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refuseSignIn.mockReturnValue(null);
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    fetchEntraName.mockResolvedValue(null);
  });

  it("refuses the sign-in the policy refuses, and writes nothing", async () => {
    refuseSignIn.mockReturnValue({ reason: "students-excluded", message: "Nur Lehrpersonen." });

    const result = await provisionUser({ ...studentClaims, ...ENTRA });

    expect(result).toEqual({
      ok: false,
      reason: "students-excluded",
      message: "Nur Lehrpersonen.",
    });
    expect(docSet).not.toHaveBeenCalled();
  });

  // A sign-in that was turned away is not a sign-in, so the record of one would be untrue.
  it("records no sign-in for somebody the policy turned away", async () => {
    refuseSignIn.mockReturnValue({ reason: "students-excluded", message: "Nur Lehrpersonen." });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(loginAdd).not.toHaveBeenCalled();
  });

  // The role has been derived by then, so the policy never has to parse a UPN itself.
  it("asks with the derived role and the provider Firebase reported", async () => {
    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(refuseSignIn).toHaveBeenCalledWith({
      accountType: "student",
      signInProvider: "microsoft.com",
    });
  });

  it("passes on an impersonated provider unchanged, so the policy can tell them apart", async () => {
    await provisionUser({ ...studentClaims, ...IMPERSONATED });

    expect(refuseSignIn).toHaveBeenCalledWith({ accountType: "student", signInProvider: "custom" });
  });

  it("provisions as usual when nothing is refused", async () => {
    const result = await provisionUser({ ...studentClaims, ...ENTRA });

    expect(result.ok).toBe(true);
  });
});

describe("provisionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refuseSignIn.mockReturnValue(null);
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    fetchEntraName.mockResolvedValue(null);
  });

  /**
   * Beneath the person rather than in their record: the record is read by whoever hands out
   * the permissions, and a history of every sign-in is not what they came for. A subcollection
   * has a rule of its own, and this one's grants nobody anything.
   */
  it("records each sign-in beneath the person who made it, on the school's clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T15:04:05Z"));

    await provisionUser(teacherClaims);

    expect(logins).toHaveBeenCalledWith("logins");
    expect(loginAdd).toHaveBeenCalledWith({ at: "2026-08-29T17:04:05+02:00" });

    vi.useRealTimers();
  });

  it("records one for somebody signing in again, rather than replacing the last", async () => {
    existingRecord({ accountType: "teacher", permissions: [] });

    await provisionUser(teacherClaims);

    expect(loginAdd).toHaveBeenCalledTimes(1);
    expect(docSet).not.toHaveBeenCalled();
  });

  /** The uid, not the address: a directory rename then updates this record instead of forking. */
  it("creates the record on first login using the uid as the document id", async () => {
    const result = await provisionUser(teacherClaims);

    expect(result).toEqual({
      ok: true,
      user: {
        id: "firebase-uid-1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@htldornbirn.at",
        accountType: "teacher",
        permissions: [],
        photo: null,
      },
    });
    expect(collection).toHaveBeenCalledWith("users");
    expect(doc).toHaveBeenCalledWith("firebase-uid-1");
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }),
    );
  });

  it("derives the student role from the student domain", async () => {
    const result = await provisionUser({
      ...teacherClaims,
      email: "sam.smith@student.htldornbirn.at",
    });

    expect(result).toMatchObject({ ok: true, user: { accountType: "student" } });
  });

  it.each([
    "jane@evil-htldornbirn.at",
    "jane@mail.htldornbirn.at",
    "jane@htldornbirn.at.evil.com",
    "jane@gmail.com",
  ])("rejects the unsupported domain %s without writing anything", async (email) => {
    const result = await provisionUser({ ...teacherClaims, email });

    expect(result).toEqual({ ok: false, reason: "unsupported-domain" });
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalled();
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("rejects a token without an email claim", async () => {
    const result = await provisionUser({ uid: "firebase-uid-1" });

    expect(result).toEqual({ ok: false, reason: "missing-upn" });
    expect(docSet).not.toHaveBeenCalled();
  });

  it("keeps the stored role on a later login instead of recomputing it", async () => {
    existingRecord({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      accountType: "student",
    });

    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { accountType: "student" } });
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ accountType: expect.anything() }),
    );
  });

  it("refreshes the profile fields on a later login", async () => {
    existingRecord({
      firstName: "Old",
      lastName: "Name",
      email: "jane.doe@htldornbirn.at",
      accountType: "teacher",
    });

    await provisionUser(teacherClaims);

    expect(docUpdate).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      photo: null,
    });
  });

  it("mirrors the stored role into the custom claim", async () => {
    await provisionUser(teacherClaims);

    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-uid-1", { accountType: "teacher" });
  });

  it("skips the claim write when the token already carries the right role", async () => {
    existingRecord({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      accountType: "teacher",
    });

    await provisionUser({ ...teacherClaims, accountType: "teacher" });

    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  /**
   * The display name is deliberately ignored: this tenant writes "Mustermann Erika", so
   * splitting it stored the name the wrong way round. The UPN is `firstname.lastname`.
   */
  it("reads the name from the UPN when given/family names are absent", async () => {
    const result = await provisionUser({
      uid: "firebase-uid-1",
      email: "jane.doe@htldornbirn.at",
      name: "Doe Jane",
    });

    expect(result).toMatchObject({ ok: true, user: { firstName: "Jane", lastName: "Doe" } });
  });

  it("capitalises what the UPN spells in lower case", async () => {
    const result = await provisionUser({
      uid: "firebase-uid-1",
      email: "anna.stauss-mueller@htldornbirn.at",
    });

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Anna", lastName: "Stauss-Mueller" },
    });
  });

  it("still produces a valid record when Entra sends no name at all", async () => {
    const result = await provisionUser({
      uid: "firebase-uid-1",
      email: "jane.doe@htldornbirn.at",
    });

    expect(result).toMatchObject({ ok: true });
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: expect.any(String), lastName: expect.any(String) }),
    );
  });

  it("prefers the name Entra holds over the display name", async () => {
    fetchEntraName.mockResolvedValue({ firstName: "Erika", lastName: "Mustermann" });

    const result = await provisionUser(
      {
        uid: "firebase-uid-1",
        email: "erika.mustermann@htldornbirn.at",
        name: "Mustermann Erika",
      },
      "graph-token",
    );

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Erika", lastName: "Mustermann" },
    });
    expect(fetchEntraName).toHaveBeenCalledWith("graph-token");
  });

  it("falls back to the UPN when Graph cannot supply a name", async () => {
    fetchEntraName.mockResolvedValue(null);

    const result = await provisionUser(
      {
        uid: "firebase-uid-1",
        email: "erika.mustermann@htldornbirn.at",
        name: "Mustermann Erika",
      },
      "graph-token",
    );

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Erika", lastName: "Mustermann" },
    });
  });

  /** Graph is asked for each name by name, so a half-filled profile still gets one right. */
  it("takes whichever half of the name Graph holds", async () => {
    fetchEntraName.mockResolvedValue({ lastName: "Musterfrau" });

    const result = await provisionUser(
      { uid: "firebase-uid-1", email: "erika.mustermann@htldornbirn.at" },
      "graph-token",
    );

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Erika", lastName: "Musterfrau" },
    });
  });

  it("does not call Graph when no access token is available", async () => {
    await provisionUser(teacherClaims);

    expect(fetchEntraName).not.toHaveBeenCalled();
  });

  it("does not call Graph for an ineligible domain", async () => {
    await provisionUser({ ...teacherClaims, email: "jane@gmail.com" }, "graph-token");

    expect(fetchEntraName).not.toHaveBeenCalled();
  });
});

/**
 * Signing in grants nothing. The administrators a school starts with are written by the seeding
 * script, so there is no race to be the first through the door — and every teacher after them is
 * granted what they need deliberately (US-2).
 */
describe("the permissions a new teacher is provisioned with", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refuseSignIn.mockReturnValue(null);
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    fetchEntraName.mockResolvedValue(null);
  });

  it("gives a new teacher none", async () => {
    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { permissions: [] } });
    expect(docSet).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }));
  });

  /** Not even the very first: there is nothing about arriving early that earns anything. */
  it("gives the same to a teacher when no other exists yet", async () => {
    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { permissions: [] } });
    expect(where).not.toHaveBeenCalled();
  });

  /** A permission says what a teacher may do; a student is not one (US-3). */
  it("gives a student none", async () => {
    const result = await provisionUser(studentClaims);

    expect(result).toMatchObject({ ok: true, user: { accountType: "student", permissions: [] } });
  });

  it("keeps the roles already stored on a later login instead of reconsidering them", async () => {
    existingRecord({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports"],
    });

    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { permissions: ["viewReports"] } });
    expect(docUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ permissions: expect.anything() }),
    );
  });

  it("reads a record written before roles existed as holding none", async () => {
    existingRecord({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      accountType: "teacher",
    });

    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { permissions: [] } });
  });
});

/**
 * Sign-in is the one moment the Graph token is held, so it is the one moment the photo can be
 * read — the token is not kept afterwards, and the browser never had one of its own (US-1).
 */
describe("provisionUser — the Entra photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refuseSignIn.mockReturnValue(null);
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    fetchEntraName.mockResolvedValue(null);
    fetchEntraPhoto.mockResolvedValue(null);
  });

  it("stores the photo Graph holds", async () => {
    fetchEntraPhoto.mockResolvedValue("data:image/jpeg;base64,AAA");

    const result = await provisionUser(teacherClaims, "graph-token");

    expect(fetchEntraPhoto).toHaveBeenCalledWith("graph-token");
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({ photo: "data:image/jpeg;base64,AAA" }),
    );
    expect(result).toMatchObject({ ok: true, user: { photo: "data:image/jpeg;base64,AAA" } });
  });

  /** An account with no photo stores none, rather than a key holding nothing. */
  it("stores null when there is no photo to store", async () => {
    const result = await provisionUser(teacherClaims, "graph-token");

    expect(docSet).toHaveBeenCalledWith(expect.objectContaining({ photo: null }));
    expect(result).toMatchObject({ ok: true, user: { photo: null } });
  });

  /** Removing it in Entra removes it here, which only a write on every login can do. */
  it("clears a photo that Entra no longer has", async () => {
    existingRecord({ accountType: "teacher", photo: "data:image/jpeg;base64,OLD" });

    await provisionUser(teacherClaims, "graph-token");

    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({ photo: null }));
  });

  it("does not ask for one without a token to ask with", async () => {
    await provisionUser(teacherClaims);

    expect(fetchEntraPhoto).not.toHaveBeenCalled();
    expect(docSet).toHaveBeenCalledWith(expect.objectContaining({ photo: null }));
  });

  /** Two independent reads of the same profile; one waiting for the other only slows sign-in. */
  it("asks for the name and the photo at the same time", async () => {
    let namePending = false;
    fetchEntraName.mockImplementation(async () => {
      namePending = true;
      return null;
    });
    fetchEntraPhoto.mockImplementation(async () => {
      expect(namePending).toBe(true);
      return null;
    });

    await provisionUser(teacherClaims, "graph-token");

    expect(fetchEntraPhoto).toHaveBeenCalled();
  });
});

/**
 * The name on a registration is a copy (US-26), and this is the repair that makes it safe: it
 * can never be more than one login out of date.
 */
describe("the login refresh of a student's registrations", () => {
  const STUDENT = studentClaims.uid;

  function seedEventSeries(id: string, isArchived = false) {
    firestore.seed("eventSeries", id, storedEventSeries({ name: `Eventreihe ${id}`, isArchived }));
  }

  function seedRegistration(eventSeriesId: string, name: Record<string, unknown>) {
    firestore.seed(registrationPath(eventSeriesId), STUDENT, {
      studentUid: STUDENT,
      email: studentClaims.email,
      class: "3AHME",
      ...name,
    });
  }

  const stored = (eventSeriesId: string) => firestore.get(registrationPath(eventSeriesId), STUDENT);

  beforeEach(() => {
    vi.clearAllMocks();
    firestore.reset();
    refuseSignIn.mockReturnValue(null);
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    fetchEntraName.mockResolvedValue(null);
  });

  it("corrects a name the directory has since changed", async () => {
    seedEventSeries("s1");
    seedRegistration("s1", { firstName: "Maks", lastName: "Mustermann" });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(stored("s1")).toMatchObject({ firstName: "Max", lastName: "Mustermann" });
  });

  it("writes only the field that differs, so a correction is not a rewrite", async () => {
    seedEventSeries("s1");
    seedRegistration("s1", { firstName: "Maks", lastName: "Mustermann" });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(firestore.batchSizes).toEqual([1]);
  });

  /** A login that changes nothing must not wake every teacher's subscription to say so. */
  it("writes nothing at all when the name has not changed", async () => {
    seedEventSeries("s1");
    seedRegistration("s1", { firstName: "Max", lastName: "Mustermann" });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(firestore.commitCount).toBe(0);
  });

  /** An archived series is read-only in everything it holds (US-19). */
  it("leaves a registration in an archived event series as it was", async () => {
    seedEventSeries("archived", true);
    seedRegistration("archived", { firstName: "Maks", lastName: "Mustermann" });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(stored("archived")).toMatchObject({ firstName: "Maks" });
    expect(firestore.commitCount).toBe(0);
  });

  it("reaches every event series the student has registered in", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2");
    seedEventSeries("archived", true);
    seedRegistration("s1", { firstName: "Maks", lastName: "Mustermann" });
    seedRegistration("s2", { firstName: "Maks", lastName: "Mustermann" });
    seedRegistration("archived", { firstName: "Maks", lastName: "Mustermann" });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(stored("s1")).toMatchObject({ firstName: "Max" });
    expect(stored("s2")).toMatchObject({ firstName: "Max" });
    expect(stored("archived")).toMatchObject({ firstName: "Maks" });
  });

  it("leaves somebody else's registration alone", async () => {
    seedEventSeries("s1");
    firestore.seed(registrationPath("s1"), "other@student.htldornbirn.at", {
      studentUid: "other@student.htldornbirn.at",
      firstName: "Maks",
      lastName: "Mustermann",
      email: "other@student.htldornbirn.at",
    });

    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(firestore.get(registrationPath("s1"), "other@student.htldornbirn.at")).toMatchObject({
      firstName: "Maks",
    });
  });

  /** A teacher keeps no registration of their own (US-15), so there is nothing to look for. */
  it("asks nothing of the registrations when a teacher signs in", async () => {
    const read = vi.spyOn(firestore, "runGroupQuery");

    await provisionUser({ ...teacherClaims, ...ENTRA });

    expect(read).not.toHaveBeenCalled();
  });

  it("writes nothing for a student who has not registered anywhere", async () => {
    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(firestore.commitCount).toBe(0);
  });
});
