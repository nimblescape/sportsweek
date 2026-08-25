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

  it("returns the user with roles from custom claims", async () => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
      roles: ["teacher"],
    });

    expect(await getSessionUser()).toEqual({
      uid: "user-1",
      email: "user@example.com",
      roles: ["teacher"],
    });
    expect(verifySessionCookie).toHaveBeenCalledWith("good-cookie", true);
  });

  it("defaults roles to an empty array when claims don't include them", async () => {
    cookiesGet.mockReturnValue({ value: "good-cookie" });
    verifySessionCookie.mockResolvedValue({ uid: "user-1", email: null });

    expect(await getSessionUser()).toEqual({ uid: "user-1", email: null, roles: [] });
  });

  it("reads the cookie using the exported cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__session");
  });
});
