/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const createSessionCookie = vi.fn();
const provisionUser = vi.fn();
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: { verifyIdToken, createSessionCookie },
}));

vi.mock("@/lib/auth/provision-user", () => ({
  provisionUser: (...args: unknown[]) => provisionUser(...args),
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
    provisionUser.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
    provisionUser.mockResolvedValue({
      ok: true,
      user: { id: "jane@htldornbirn.at", role: "teacher" },
    });
  });

  it("returns the provisioned role so the client can skip the landing hop", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@htldornbirn.at" });
    createSessionCookie.mockResolvedValue("session-cookie-value");

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(await response.json()).toMatchObject({ status: "ok", role: "teacher" });
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
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@htldornbirn.at" });
    createSessionCookie.mockResolvedValue("session-cookie-value");

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(response.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "__session",
      "session-cookie-value",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("provisions the user from the verified claims", async () => {
    const claims = { uid: "user-1", email: "jane@htldornbirn.at" };
    verifyIdToken.mockResolvedValue(claims);
    createSessionCookie.mockResolvedValue("session-cookie-value");

    await POST(postRequest({ idToken: "good-token" }));

    expect(provisionUser).toHaveBeenCalledWith(claims, undefined);
  });

  it("forwards the Microsoft access token so the name can come from Graph", async () => {
    const claims = { uid: "user-1", email: "jane@htldornbirn.at" };
    verifyIdToken.mockResolvedValue(claims);
    createSessionCookie.mockResolvedValue("session-cookie-value");

    await POST(postRequest({ idToken: "good-token", msAccessToken: "graph-token" }));

    expect(provisionUser).toHaveBeenCalledWith(claims, "graph-token");
  });

  it.each(["unsupported-domain", "missing-upn"])(
    "returns 403 and sets no cookie when provisioning fails with %s",
    async (reason) => {
      verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@gmail.com" });
      provisionUser.mockResolvedValue({ ok: false, reason });

      const response = await POST(postRequest({ idToken: "good-token" }));

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("PERMISSION_DENIED");
      expect(cookieStore.set).not.toHaveBeenCalled();
      expect(createSessionCookie).not.toHaveBeenCalled();
    },
  );

  it("does not reveal which domains are accepted", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@gmail.com" });
    provisionUser.mockResolvedValue({ ok: false, reason: "unsupported-domain" });

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(JSON.stringify(await response.json())).not.toContain("htldornbirn");
  });

  it("returns 500 and sets no cookie when provisioning throws", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@htldornbirn.at" });
    provisionUser.mockRejectedValue(new Error("5 NOT_FOUND: the database does not exist"));

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it("does not leak internal failure details to the client", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "jane@htldornbirn.at" });
    provisionUser.mockRejectedValue(new Error("5 NOT_FOUND: the database does not exist"));

    const response = await POST(postRequest({ idToken: "good-token" }));

    expect(JSON.stringify(await response.json())).not.toContain("NOT_FOUND");
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
