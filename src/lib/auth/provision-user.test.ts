/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const docGet = vi.fn();
const docSet = vi.fn();
const docUpdate = vi.fn();
const doc = vi.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));
const collection = vi.fn(() => ({ doc }));
const setCustomUserClaims = vi.fn();
const fetchEntraName = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection },
  adminAuth: { setCustomUserClaims },
}));

vi.mock("@/lib/auth/graph", () => ({ fetchEntraName }));

// Whatever else a deployment refuses. Production refuses nothing, so the tests below say so
// explicitly rather than leaning on which module the build happens to resolve.
const refuseSignIn = vi.fn();
vi.mock("@/lib/auth/sign-in-policy", () => ({ refuseSignIn }));

const { provisionUser } = await import("@/lib/auth/provision-user");

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

  // The role has been derived by then, so the policy never has to parse a UPN itself.
  it("asks with the derived role and the provider Firebase reported", async () => {
    await provisionUser({ ...studentClaims, ...ENTRA });

    expect(refuseSignIn).toHaveBeenCalledWith({
      role: "student",
      signInProvider: "microsoft.com",
    });
  });

  it("passes on an impersonated provider unchanged, so the policy can tell them apart", async () => {
    await provisionUser({ ...studentClaims, ...IMPERSONATED });

    expect(refuseSignIn).toHaveBeenCalledWith({ role: "student", signInProvider: "custom" });
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

  it("creates the record on first login using the UPN as the document id", async () => {
    const result = await provisionUser(teacherClaims);

    expect(result).toEqual({
      ok: true,
      user: {
        id: "jane.doe@htldornbirn.at",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@htldornbirn.at",
        role: "teacher",
      },
    });
    expect(collection).toHaveBeenCalledWith("users");
    expect(doc).toHaveBeenCalledWith("jane.doe@htldornbirn.at");
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Jane", lastName: "Doe", role: "teacher" }),
    );
  });

  it("derives the student role from the student domain", async () => {
    const result = await provisionUser({
      ...teacherClaims,
      email: "sam.smith@student.htldornbirn.at",
    });

    expect(result).toMatchObject({ ok: true, user: { role: "student" } });
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
      role: "student",
    });

    const result = await provisionUser(teacherClaims);

    expect(result).toMatchObject({ ok: true, user: { role: "student" } });
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: expect.anything() }),
    );
  });

  it("refreshes the profile fields on a later login", async () => {
    existingRecord({
      firstName: "Old",
      lastName: "Name",
      email: "jane.doe@htldornbirn.at",
      role: "teacher",
    });

    await provisionUser(teacherClaims);

    expect(docUpdate).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
    });
  });

  it("mirrors the stored role into the custom claim", async () => {
    await provisionUser(teacherClaims);

    expect(setCustomUserClaims).toHaveBeenCalledWith("firebase-uid-1", { role: "teacher" });
  });

  it("skips the claim write when the token already carries the right role", async () => {
    existingRecord({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@htldornbirn.at",
      role: "teacher",
    });

    await provisionUser({ ...teacherClaims, role: "teacher" });

    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("falls back to the display name when given/family names are absent", async () => {
    const result = await provisionUser({
      uid: "firebase-uid-1",
      email: "jane.doe@htldornbirn.at",
      name: "Jane Doe",
    });

    expect(result).toMatchObject({ ok: true, user: { firstName: "Jane", lastName: "Doe" } });
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

  it("falls back to the display name when Graph cannot supply a name", async () => {
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
      user: { firstName: "Mustermann", lastName: "Erika" },
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
