/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const stagingLoginGet = vi.fn();
const stagingLoginDoc = vi.fn(() => ({ get: stagingLoginGet }));
const collection = vi.fn(() => ({ doc: stagingLoginDoc }));

vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection } }));

const { refuseSignIn } = await import("@/lib/auth/fake/sign-in-policy");

const TEACHER = "jane.doe@htldornbirn.at";
const STUDENT = "max.mustermann@student.htldornbirn.at";

/**
 * Impersonation is what a test environment exists for, and it stays open: the token this
 * project's own server signs is the whole of what a fake login can mint, and who may mint one
 * is already a teacher-only capability enforced where it is minted (`entraTeacherCookie` in the
 * fake-login route).
 *
 * A genuine Entra ID sign-in is a different question, because this is also where real people's
 * data lives: only an address on `stagingLogins` may sign in as itself, of whatever account
 * type, and everyone else's own Office 365 account is turned back to production instead —
 * before it is ever provisioned, and so before it could ever reach a session to impersonate from.
 */
describe("refuseSignIn in a test environment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingLoginGet.mockResolvedValue({ exists: false });
  });

  it("refuses an Entra ID sign-in that names no address to check", async () => {
    await expect(refuseSignIn({ signInProvider: "microsoft.com" })).resolves.toMatchObject({
      reason: "staging-restricted",
    });
  });

  /** The one thing this environment trusts that production does not. */
  it("admits a token this project's own server signed", async () => {
    await expect(refuseSignIn({ signInProvider: "custom" })).resolves.toBeNull();
  });

  /**
   * The fake login adds one provider to the two this environment trusts; it does not open the
   * rest. An e-mail sign-up still asserts whatever address it is handed.
   */
  it.each(["password", "google.com", "anonymous", undefined])(
    "refuses a sign-in through %s",
    async (signInProvider) => {
      await expect(refuseSignIn({ signInProvider, email: TEACHER })).resolves.toMatchObject({
        reason: "untrusted-provider",
      });
    },
  );

  it("refuses a student's own Entra sign-in just as it does a teacher's", async () => {
    await expect(
      refuseSignIn({ signInProvider: "microsoft.com", email: STUDENT }),
    ).resolves.toMatchObject({ reason: "staging-restricted" });
  });

  it("admits a student's own Entra sign-in once it is on the staging list", async () => {
    stagingLoginGet.mockResolvedValue({ exists: true });

    await expect(
      refuseSignIn({ signInProvider: "microsoft.com", email: STUDENT }),
    ).resolves.toBeNull();
  });

  it("admits a member of staff this deployment's list names", async () => {
    stagingLoginGet.mockResolvedValue({ exists: true });

    await expect(
      refuseSignIn({ signInProvider: "microsoft.com", email: TEACHER }),
    ).resolves.toBeNull();
  });

  it("refuses a member of staff this deployment has not provisioned", async () => {
    await expect(
      refuseSignIn({ signInProvider: "microsoft.com", email: TEACHER }),
    ).resolves.toMatchObject({ reason: "staging-restricted" });
  });
});
