/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const verifySessionCookie = vi.fn();
const cookiesGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookiesGet }),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: { verifySessionCookie },
}));

const { getSessionUser, SESSION_COOKIE_NAME } = await import("@/lib/session");

describe("getSessionUser", () => {
  beforeEach(() => {
    verifySessionCookie.mockReset();
    cookiesGet.mockReset();
  });

  it("returns null when there is no session cookie", async () => {
    cookiesGet.mockReturnValue(undefined);
    expect(await getSessionUser()).toBeNull();
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it("returns null when the session cookie is invalid", async () => {
    cookiesGet.mockReturnValue({ value: "bad-cookie" });
    verifySessionCookie.mockRejectedValue(new Error("invalid"));
    expect(await getSessionUser()).toBeNull();
  });

  it("returns the user with the role from custom claims", async () => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
      role: "teacher",
    });

    expect(await getSessionUser()).toEqual({
      uid: "user-1",
      email: "user@example.com",
      role: "teacher",
    });
    expect(verifySessionCookie).toHaveBeenCalledWith("good-cookie", true);
  });

  it("returns a null role when the claim is missing", async () => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({ uid: "user-1", email: null });

    expect(await getSessionUser()).toEqual({ uid: "user-1", email: null, role: null });
  });

  it.each(["admin", "", 42])("returns a null role for the unsupported claim %p", async (role) => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({ uid: "user-1", email: null, role });

    expect(await getSessionUser()).toEqual({ uid: "user-1", email: null, role: null });
  });

  it("ignores a legacy roles array, so the old model cannot grant access", async () => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({ uid: "user-1", email: null, roles: ["teacher"] });

    expect(await getSessionUser()).toEqual({ uid: "user-1", email: null, role: null });
  });

  it("reads the cookie using the exported cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__session");
  });
});
