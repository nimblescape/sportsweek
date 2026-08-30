/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser }));

const {
  PERMISSION_DENIED_HINT,
  requirePermissionOrResponse,
  requirePermissionIdentityOrResponse,
  requireStudentOrResponse,
} = await import("@/lib/api/handler");

const teacher = (...permissions: string[]) => ({
  uid: "uid-1",
  email: "Jane@HTLDornbirn.at",
  accountType: "teacher",
  permissions,
});

const student = { uid: "uid-2", email: "sam@student.htldornbirn.at", accountType: "student" };

beforeEach(() => vi.clearAllMocks());

describe("requirePermissionOrResponse", () => {
  it("admits a teacher holding the permission", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher("editMasterData"));

    expect(await requirePermissionOrResponse("editMasterData")).toBeNull();
  });

  it("asks an unauthenticated caller to sign in", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await requirePermissionOrResponse("editMasterData");

    expect(response?.status).toBe(401);
  });

  /** Each permission is asked for by name, so holding another is holding none of this one. */
  it("refuses a teacher holding a different permission", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher("viewReports", "editAssignments"));

    const response = await requirePermissionOrResponse("editMasterData");

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ error: { message: PERMISSION_DENIED_HINT } });
  });

  it("refuses a teacher holding none", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher());

    expect((await requirePermissionOrResponse("viewReports"))?.status).toBe(403);
  });

  /** The same sentence whichever permission was missing: a refusal teaches nothing. */
  it("names no permission in the refusal", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher());

    const response = await requirePermissionOrResponse("editUsers");
    const body = JSON.stringify(await response?.json());

    expect(body).not.toContain("editUsers");
  });

  it("refuses a student whose record lists the permission anyway", async () => {
    getAuthenticatedUser.mockResolvedValue({ ...student, permissions: ["editUsers"] });

    expect((await requirePermissionOrResponse("editUsers"))?.status).toBe(403);
  });
});

describe("requirePermissionIdentityOrResponse", () => {
  /** The uid, which is what a record is keyed by and the one identifier no client can move. */
  it("returns the caller's uid rather than their address", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher("editReports"));

    expect(await requirePermissionIdentityOrResponse("editReports")).toEqual({
      ok: true,
      userId: "uid-1",
    });
  });

  /** An address is no longer what attributes a write, so a session lacking one is still served. */
  it("admits a session carrying no address at all", async () => {
    getAuthenticatedUser.mockResolvedValue({ ...teacher("editReports"), email: null });

    expect(await requirePermissionIdentityOrResponse("editReports")).toEqual({
      ok: true,
      userId: "uid-1",
    });
  });

  it("refuses a teacher holding a different permission", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher("viewReports"));

    const outcome = await requirePermissionIdentityOrResponse("editReports");

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.response.status).toBe(403);
  });
});

describe("requireStudentOrResponse", () => {
  it("admits a student, who carries no permissions to check", async () => {
    getAuthenticatedUser.mockResolvedValue({ ...student, permissions: [] });

    expect(await requireStudentOrResponse()).toEqual({
      ok: true,
      userId: "uid-2",
    });
  });

  /** A teacher keeps no registration of their own (US-15), so this one is not hierarchical. */
  it("refuses a teacher holding everything", async () => {
    getAuthenticatedUser.mockResolvedValue(teacher("editUsers", "editMasterData"));

    const outcome = await requireStudentOrResponse();

    expect(outcome.ok).toBe(false);
  });
});
