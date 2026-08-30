/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import {
  DEVELOPMENT_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
} from "@/lib/auth/auth-mode";

const getUserByEmail = vi.fn();
const createUser = vi.fn();
const createCustomToken = vi.fn();
const verifySessionCookie = vi.fn();
const firestore = new FakeFirestore();
const cookieStore = { get: vi.fn(), set: vi.fn() };

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
    createUser: (...args: unknown[]) => createUser(...args),
    createCustomToken: (...args: unknown[]) => createCustomToken(...args),
    verifySessionCookie: (...args: unknown[]) => verifySessionCookie(...args),
  },
  adminDb: firestore,
}));

const { GET, POST } = await import("@/app/api/auth/fake/route.fake");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/auth/fake", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ENTRA_TEACHER = {
  uid: "real-uid",
  email: "jane.doe@htldornbirn.at",
  accountType: "teacher",
  firebase: { sign_in_provider: "microsoft.com" },
};

/** Whatever cookie the browser is holding when the fake login is called. */
function signedInWith(cookies: Record<string, string>, decoded: unknown = ENTRA_TEACHER) {
  cookieStore.get.mockImplementation((name: string) =>
    cookies[name] === undefined ? undefined : { value: cookies[name] },
  );
  verifySessionCookie.mockResolvedValue(decoded);
}

describe("/api/auth/fake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.reset();
    vi.stubEnv("AUTH_MODE", "fake");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", STAGING_PROJECT_ID);
    getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    createUser.mockImplementation(({ email }: { email: string }) => ({ uid: `uid-${email}` }));
    createCustomToken.mockResolvedValue("custom-token");
    signedInWith({ __session: "entra-cookie" });
  });

  afterEach(() => vi.unstubAllEnvs());

  // The fake login mints sessions, so a session alone cannot be the credential that unlocks
  // it — one forged identity would otherwise authorise minting the next indefinitely.
  describe("the Entra ID gate", () => {
    it.each([
      ["nobody is signed in", {}, ENTRA_TEACHER],
      [
        "the session came from a custom token",
        { __session: "impersonated" },
        { ...ENTRA_TEACHER, firebase: { sign_in_provider: "custom" } },
      ],
      [
        "the signed-in user is a student",
        { __session: "entra-cookie" },
        { ...ENTRA_TEACHER, accountType: "student" },
      ],
    ])("refuses when %s", async (_case, cookies, decoded) => {
      signedInWith(cookies, decoded);

      const listed = await GET();
      const minted = await POST(
        postRequest({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }),
      );

      expect(listed.status).toBe(403);
      expect(minted.status).toBe(403);
      expect(createCustomToken).not.toHaveBeenCalled();
    });

    it("refuses when the cookie does not verify", async () => {
      cookieStore.get.mockReturnValue({ value: "tampered" });
      verifySessionCookie.mockRejectedValue(new Error("invalid"));

      expect((await GET()).status).toBe(403);
    });

    // Impersonating replaces __session with a custom-token one, so the Entra credential is
    // kept aside — otherwise a tester could switch identity exactly once.
    it("keeps admitting the tester after they have impersonated someone", async () => {
      signedInWith({ __session: "impersonated", __entra_session: "entra-cookie" }, ENTRA_TEACHER);
      verifySessionCookie.mockImplementation(async (cookie: string) =>
        cookie === "entra-cookie"
          ? ENTRA_TEACHER
          : { ...ENTRA_TEACHER, firebase: { sign_in_provider: "custom" } },
      );

      expect((await GET()).status).toBe(200);
    });

    it("remembers the Entra session so later switches still pass", async () => {
      await POST(postRequest({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }));

      expect(cookieStore.set).toHaveBeenCalledWith(
        "__entra_session",
        "entra-cookie",
        expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
      );
    });
  });

  describe("when the fake login is not enabled", () => {
    it.each([
      [
        "no one asked for it, in the one environment that is asked",
        () => {
          vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", DEVELOPMENT_PROJECT_ID);
          vi.stubEnv("AUTH_MODE", "entra");
        },
      ],
      [
        "the project holds real data",
        () => vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", PRODUCTION_PROJECT_ID),
      ],
      [
        "the project is one nobody named",
        () => vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "htld-sportsweek-somewhere-else"),
      ],
    ])("answers as if the endpoint did not exist because %s", async (_case, disable) => {
      disable();

      const listed = await GET();
      const minted = await POST(
        postRequest({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }),
      );

      expect(listed.status).toBe(404);
      expect(minted.status).toBe(404);
      expect(createCustomToken).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    /** Named by the record's address: the document id is an opaque uid now (US-31). */
    it("lists the known users by address so an existing one can be picked", async () => {
      firestore.seed("users", "uid-of-zoe", {
        firstName: "Zoe",
        lastName: "Zimmer",
        email: "zoe.zimmer@student.htldornbirn.at",
        accountType: "student",
      });
      firestore.seed("users", "uid-of-jane", {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@htldornbirn.at",
        accountType: "teacher",
      });

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        users: [
          {
            email: "jane.doe@htldornbirn.at",
            firstName: "Jane",
            lastName: "Doe",
            accountType: "teacher",
          },
          {
            email: "zoe.zimmer@student.htldornbirn.at",
            firstName: "Zoe",
            lastName: "Zimmer",
            accountType: "student",
          },
        ],
      });
    });

    it("skips a record that does not parse instead of failing the whole list", async () => {
      firestore.seed("users", "broken@htldornbirn.at", { firstName: "Nur", accountType: "wizard" });

      const response = await GET();

      expect(await response.json()).toEqual({ users: [] });
    });
  });

  describe("POST", () => {
    it("derives the UPN from the name and the chosen role", async () => {
      const response = await POST(
        postRequest({ firstName: "Jürgen", lastName: "Müller", accountType: "student" }),
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

    // The UPN provisionUser otherwise falls back to spells umlauts out and loses the spaces,
    // so carrying the parts as claims keeps the record exactly as it was typed.
    it("passes the typed names through as token claims", async () => {
      await POST(
        postRequest({ firstName: "Anna Maria", lastName: "van Berg", accountType: "teacher" }),
      );

      expect(createCustomToken).toHaveBeenCalledWith("uid-anna-maria.van-berg@htldornbirn.at", {
        given_name: "Anna Maria",
        family_name: "van Berg",
      });
    });

    it("reuses the auth account when the UPN is already known", async () => {
      getUserByEmail.mockResolvedValue({ uid: "existing-uid" });

      await POST(postRequest({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }));

      expect(createUser).not.toHaveBeenCalled();
      expect(createCustomToken).toHaveBeenCalledWith("existing-uid", expect.anything());
    });

    it.each([
      ["a missing last name", { firstName: "Jane", accountType: "teacher" }],
      ["an unknown role", { firstName: "Jane", lastName: "Doe", accountType: "admin" }],
      ["a blank first name", { firstName: "   ", lastName: "Doe", accountType: "teacher" }],
    ])("returns 400 for %s", async (_case, body) => {
      const response = await POST(postRequest(body));

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(createCustomToken).not.toHaveBeenCalled();
    });

    it("returns 400 when the name yields no UPN the tenant could issue", async () => {
      const response = await POST(
        postRequest({ firstName: "字", lastName: "字", accountType: "teacher" }),
      );

      expect(response.status).toBe(400);
      expect(createCustomToken).not.toHaveBeenCalled();
    });

    it("returns 500 without leaking the cause when the Admin SDK fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      createCustomToken.mockRejectedValue(new Error("credentials missing"));

      const response = await POST(
        postRequest({ firstName: "Jane", lastName: "Doe", accountType: "teacher" }),
      );

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("credentials missing");
    });
  });
});
