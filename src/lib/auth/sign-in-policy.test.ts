/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { SignInInterstitial } from "@/components/auth/sign-in-interstitial";
import { refuseSignIn } from "@/lib/auth/sign-in-policy";

/**
 * These two are what a build resolves to unless it opts into the fake login, so the assertions
 * are about what production does *not* do. If an alias in `next.config.ts` were ever to stop
 * matching, this is the behaviour that would be left — which is why it is the safe one.
 */
describe("the production facades", () => {
  it("puts nothing between signing in and the app", () => {
    expect(SignInInterstitial).toBeNull();
  });

  it("refuses no sign-in of its own accord", () => {
    expect(refuseSignIn({ role: "student", signInProvider: "microsoft.com" })).toBeNull();
    expect(refuseSignIn({ role: "teacher", signInProvider: "microsoft.com" })).toBeNull();
  });
});
