/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { refuseSignIn } from "@/lib/auth/fake/sign-in-policy";

/**
 * A test environment holds invented people and unfinished work. A student's real account has
 * no business there — but an impersonated student is exactly what it is for.
 */
describe("refuseSignIn in a test environment", () => {
  it("turns away a student signing in with their real account", () => {
    expect(refuseSignIn({ accountType: "student", signInProvider: "microsoft.com" })).toEqual({
      reason: "students-excluded",
      message: "Diese Umgebung steht nur Lehrpersonen offen.",
    });
  });

  // Which is the whole point of the environment.
  it("admits a student the fake login is standing in for", () => {
    expect(refuseSignIn({ accountType: "student", signInProvider: "custom" })).toBeNull();
  });

  it("leaves teachers alone either way", () => {
    expect(refuseSignIn({ accountType: "teacher", signInProvider: "microsoft.com" })).toBeNull();
    expect(refuseSignIn({ accountType: "teacher", signInProvider: "custom" })).toBeNull();
  });

  /**
   * The fake login adds one provider to the two this environment trusts; it does not open the
   * rest. An e-mail sign-up still asserts whatever address it is handed.
   */
  it.each(["password", "google.com", "anonymous", undefined])(
    "refuses a sign-in through %s",
    (signInProvider) => {
      expect(refuseSignIn({ accountType: "teacher", signInProvider })).toMatchObject({
        reason: "untrusted-provider",
      });
    },
  );
});
