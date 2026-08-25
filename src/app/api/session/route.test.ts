import { describe, expect, it, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const createSessionCookie = vi.fn();
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: { verifyIdToken, createSessionCookie },
}));

const { POST, DELETE } = await import("@/app/api/session/route");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/session", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    createSessionCookie.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
  });

  it("returns 400 when idToken is missing", async () => {
    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 401 when the ID token is invalid", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid token"));

    const response = await POST(postRequest({ idToken: "bad-token" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("sets a session cookie and returns 200 for a valid ID token", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1" });
    createSessionCookie.mockResolvedValue("session-cookie-value");

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(response.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "__session",
      "session-cookie-value",
      expect.objectContaining({ httpOnly: true }),
    );
  });
});

describe("DELETE /api/session", () => {
  it("clears the session cookie", async () => {
    cookieStore.delete.mockReset();

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(cookieStore.delete).toHaveBeenCalledWith("__session");
  });
});
