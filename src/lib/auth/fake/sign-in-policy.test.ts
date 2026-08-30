/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { refuseSignIn } from "@/lib/auth/fake/sign-in-policy";

/**
 * A test environment holds invented people and unfinished work, and impersonation is what it
 * exists for. It does not decide who may come in: a student's own path through Entra ID is
 * following an invitation link (US-23), and turning that account away left the flow with the
 * most strangers in it as the one flow nobody could rehearse.
 */
describe("refuseSignIn in a test environment", () => {
  it("admits the school's own directory, as production does", () => {
    expect(refuseSignIn({ signInProvider: "microsoft.com" })).toBeNull();
  });

  /** The one thing this environment trusts that production does not. */
  it("admits a token this project's own server signed", () => {
    expect(refuseSignIn({ signInProvider: "custom" })).toBeNull();
  });

  /**
   * The fake login adds one provider to the two this environment trusts; it does not open the
   * rest. An e-mail sign-up still asserts whatever address it is handed.
   */
  it.each(["password", "google.com", "anonymous", undefined])(
    "refuses a sign-in through %s",
    (signInProvider) => {
      expect(refuseSignIn({ signInProvider })).toMatchObject({
        reason: "untrusted-provider",
      });
    },
  );
});
