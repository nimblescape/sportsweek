/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const getUserByEmail = vi.fn();
const createUser = vi.fn();
const createCustomToken = vi.fn();
const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
    createUser: (...args: unknown[]) => createUser(...args),
    createCustomToken: (...args: unknown[]) => createCustomToken(...args),
  },
  adminDb: firestore,
}));

const { GET, POST } = await import("@/app/api/auth/fake/route");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/auth/fake", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/auth/fake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.reset();
    vi.stubEnv("AUTH_MODE", "fake");
    getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    createUser.mockImplementation(({ email }: { email: string }) => ({ uid: `uid-${email}` }));
    createCustomToken.mockResolvedValue("custom-token");
  });

  afterEach(() => vi.unstubAllEnvs());

  describe("when the fake login is not enabled", () => {
    it.each([
      ["no one asked for it", () => vi.stubEnv("AUTH_MODE", "entra")],
      ["the build is a production one", () => vi.stubEnv("NODE_ENV", "production")],
    ])("answers as if the endpoint did not exist because %s", async (_case, disable) => {
      disable();

      const listed = await GET();
      const minted = await POST(
        postRequest({ firstName: "Jane", lastName: "Doe", role: "teacher" }),
      );

      expect(listed.status).toBe(404);
      expect(minted.status).toBe(404);
      expect(createCustomToken).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("lists the known users by UPN so an existing one can be picked", async () => {
      firestore.seed("users", "zoe.zimmer@student.htldornbirn.at", {
        firstName: "Zoe",
        lastName: "Zimmer",
        email: "zoe.zimmer@student.htldornbirn.at",
        role: "student",
      });
      firestore.seed("users", "jane.doe@htldornbirn.at", {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@htldornbirn.at",
        role: "teacher",
      });

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        users: [
          { upn: "jane.doe@htldornbirn.at", firstName: "Jane", lastName: "Doe", role: "teacher" },
          {
            upn: "zoe.zimmer@student.htldornbirn.at",
            firstName: "Zoe",
            lastName: "Zimmer",
            role: "student",
          },
        ],
      });
    });

    it("skips a record that does not parse instead of failing the whole list", async () => {
      firestore.seed("users", "broken@htldornbirn.at", { firstName: "Nur", role: "wizard" });

      const response = await GET();

      expect(await response.json()).toEqual({ users: [] });
    });
  });

  describe("POST", () => {
    it("derives the UPN from the name and the chosen role", async () => {
      const response = await POST(
        postRequest({ firstName: "Jürgen", lastName: "Müller", role: "student" }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        customToken: "custom-token",
        upn: "juergen.mueller@student.htldornbirn.at",
      });
      expect(createUser).toHaveBeenCalledWith({
        email: "juergen.mueller@student.htldornbirn.at",
        displayName: "Jürgen Müller",
        emailVerified: true,
      });
    });

    // provisionUser splits a display name on whitespace, which mangles a multi-word name —
    // carrying the parts as claims keeps the record exactly as it was typed.
    it("passes the typed names through as token claims", async () => {
      await POST(postRequest({ firstName: "Anna Maria", lastName: "van Berg", role: "teacher" }));

      expect(createCustomToken).toHaveBeenCalledWith("uid-anna-maria.van-berg@htldornbirn.at", {
        given_name: "Anna Maria",
        family_name: "van Berg",
      });
    });

    it("reuses the auth account when the UPN is already known", async () => {
      getUserByEmail.mockResolvedValue({ uid: "existing-uid" });

      await POST(postRequest({ firstName: "Jane", lastName: "Doe", role: "teacher" }));

      expect(createUser).not.toHaveBeenCalled();
      expect(createCustomToken).toHaveBeenCalledWith("existing-uid", expect.anything());
    });

    it.each([
      ["a missing last name", { firstName: "Jane", role: "teacher" }],
      ["an unknown role", { firstName: "Jane", lastName: "Doe", role: "admin" }],
      ["a blank first name", { firstName: "   ", lastName: "Doe", role: "teacher" }],
    ])("returns 400 for %s", async (_case, body) => {
      const response = await POST(postRequest(body));

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(createCustomToken).not.toHaveBeenCalled();
    });

    it("returns 400 when the name yields no UPN the tenant could issue", async () => {
      const response = await POST(
        postRequest({ firstName: "字", lastName: "字", role: "teacher" }),
      );

      expect(response.status).toBe(400);
      expect(createCustomToken).not.toHaveBeenCalled();
    });

    it("returns 500 without leaking the cause when the Admin SDK fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      createCustomToken.mockRejectedValue(new Error("credentials missing"));

      const response = await POST(
        postRequest({ firstName: "Jane", lastName: "Doe", role: "teacher" }),
      );

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("credentials missing");
    });
  });
});
