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

describe("provisionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    fetchEntraName.mockResolvedValue({ firstName: "Hannes", lastName: "Stauss" });

    const result = await provisionUser(
      { uid: "firebase-uid-1", email: "hannes.stauss@htldornbirn.at", name: "Stauss Hannes" },
      "graph-token",
    );

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Hannes", lastName: "Stauss" },
    });
    expect(fetchEntraName).toHaveBeenCalledWith("graph-token");
  });

  it("falls back to the display name when Graph cannot supply a name", async () => {
    fetchEntraName.mockResolvedValue(null);

    const result = await provisionUser(
      { uid: "firebase-uid-1", email: "hannes.stauss@htldornbirn.at", name: "Stauss Hannes" },
      "graph-token",
    );

    expect(result).toMatchObject({
      ok: true,
      user: { firstName: "Stauss", lastName: "Hannes" },
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
