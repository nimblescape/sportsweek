/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const docGet = vi.fn();
const doc = vi.fn(() => ({ get: docGet }));
const collection = vi.fn(() => ({ doc }));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/session", () => ({ getSessionUser }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection } }));

const {
  getAuthenticatedUser,
  requirePermission,
  requireStudent,
  requireTeacher,
  requireUser,
  resolveAccountType,
  satisfiesAccountType,
} = await import("@/lib/auth/guards");

const teacherSession = {
  uid: "uid-1",
  email: "jane@htldornbirn.at",
  accountType: "teacher" as const,
};
const studentSession = {
  uid: "uid-2",
  email: "sam@student.htldornbirn.at",
  accountType: "student" as const,
};

async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toThrow(`REDIRECT:${url}`);
}

describe("satisfiesAccountType", () => {
  it("lets a teacher satisfy every student-level check", () => {
    expect(satisfiesAccountType("teacher", "student")).toBe(true);
  });

  it.each([
    ["teacher", "teacher", true],
    ["student", "student", true],
    ["student", "teacher", false],
  ] as const)("returns %s->%s = %s", (actual, required, expected) => {
    expect(satisfiesAccountType(actual, required)).toBe(expected);
  });
});

describe("resolveAccountType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the custom claim without reading Firestore", async () => {
    expect(await resolveAccountType(teacherSession)).toBe("teacher");
    expect(collection).not.toHaveBeenCalled();
  });

  it("falls back to the stored record when the claim is missing", async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "student" }) });

    expect(await resolveAccountType({ ...studentSession, accountType: null })).toBe("student");
    expect(doc).toHaveBeenCalledWith("uid-2");
  });

  it("returns null when no record exists", async () => {
    docGet.mockResolvedValue({ exists: false, data: () => undefined });

    expect(await resolveAccountType({ ...studentSession, accountType: null })).toBeNull();
  });

  it("returns null when the stored role is unsupported", async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "admin" }) });

    expect(await resolveAccountType({ ...studentSession, accountType: null })).toBeNull();
  });

  /** The record is keyed by the uid, so a session carrying no address still finds it (US-31). */
  it("still reads the record for a session carrying no address", async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "student" }) });

    expect(await resolveAccountType({ uid: "uid-3", email: null, accountType: null })).toBe(
      "student",
    );
    expect(doc).toHaveBeenCalledWith("uid-3");
  });
});

describe("requireUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to sign-in without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    await expectRedirect(requireUser(), "/sign-in");
  });

  it("redirects to sign-in when no role can be resolved", async () => {
    getSessionUser.mockResolvedValue({ ...studentSession, accountType: null });
    docGet.mockResolvedValue({ exists: false, data: () => undefined });

    await expectRedirect(requireUser(), "/sign-in");
  });

  it("returns the user together with the resolved role", async () => {
    getSessionUser.mockResolvedValue(teacherSession);

    expect(await requireUser()).toMatchObject({ uid: "uid-1", accountType: "teacher" });
  });
});

describe("requireTeacher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the teacher", async () => {
    getSessionUser.mockResolvedValue(teacherSession);

    expect(await requireTeacher()).toMatchObject({ accountType: "teacher" });
  });

  it("redirects a student away from a teacher-only page", async () => {
    getSessionUser.mockResolvedValue(studentSession);

    await expectRedirect(requireTeacher(), "/app");
  });
});

describe("requireStudent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the student", async () => {
    getSessionUser.mockResolvedValue(studentSession);

    expect(await requireStudent()).toMatchObject({ accountType: "student" });
  });

  it("redirects a teacher, who has no master data record of their own", async () => {
    getSessionUser.mockResolvedValue(teacherSession);

    await expectRedirect(requireStudent(), "/app");
  });
});

describe("getAuthenticatedUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null instead of redirecting, so handlers can emit the error envelope", async () => {
    getSessionUser.mockResolvedValue(null);

    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns the user with the resolved account type", async () => {
    getSessionUser.mockResolvedValue(studentSession);
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "student" }) });

    expect(await getAuthenticatedUser()).toMatchObject({ accountType: "student" });
  });

  /**
   * The account type may come from the claim, but a permission never does: it is granted and
   * withdrawn while a session is live, so a token minted beforehand would go on admitting what
   * an admin has just taken away (US-2).
   */
  it("reads the permissions from the record even when the claim answered the account type", async () => {
    getSessionUser.mockResolvedValue(teacherSession);
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ accountType: "teacher", permissions: ["editMasterData"] }),
    });

    expect(await getAuthenticatedUser()).toMatchObject({ permissions: ["editMasterData"] });
    expect(doc).toHaveBeenCalledWith("uid-1");
  });

  it("reads a record written before permissions existed as holding none", async () => {
    getSessionUser.mockResolvedValue(teacherSession);
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "teacher" }) });

    expect(await getAuthenticatedUser()).toMatchObject({ permissions: [] });
  });

  it("grants a student none, whatever their record lists", async () => {
    getSessionUser.mockResolvedValue(studentSession);
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ accountType: "student", permissions: ["editUsers"] }),
    });

    expect(await getAuthenticatedUser()).toMatchObject({ permissions: [] });
  });
});

describe("requirePermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the teacher who holds it", async () => {
    getSessionUser.mockResolvedValue(teacherSession);
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ accountType: "teacher", permissions: ["editMasterData"] }),
    });

    expect(await requirePermission("editMasterData")).toMatchObject({
      permissions: ["editMasterData"],
    });
  });

  it("sends a teacher holding a different one back to the landing route", async () => {
    getSessionUser.mockResolvedValue(teacherSession);
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ accountType: "teacher", permissions: ["viewReports"] }),
    });

    await expectRedirect(requirePermission("editUsers"), "/app");
  });

  it("sends a teacher holding none back to the landing route", async () => {
    getSessionUser.mockResolvedValue(teacherSession);
    docGet.mockResolvedValue({ exists: true, data: () => ({ accountType: "teacher" }) });

    await expectRedirect(requirePermission("viewReports"), "/app");
  });

  it("sends a student back, whatever their record lists", async () => {
    getSessionUser.mockResolvedValue(studentSession);
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ accountType: "student", permissions: ["editUsers"] }),
    });

    await expectRedirect(requirePermission("editUsers"), "/app");
  });
});
