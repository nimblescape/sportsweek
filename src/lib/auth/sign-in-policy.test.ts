/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { refuseSignIn } from "@/lib/auth/sign-in-policy";

/**
 * What a build resolves to unless it opts into the fake login. If the alias in
 * `next.config.ts` were ever to stop matching, this is the behaviour that would be left —
 * which is why it is the safe one.
 */
describe("the production sign-in policy", () => {
  it("refuses no sign-in of its own accord", () => {
    expect(refuseSignIn({ accountType: "student", signInProvider: "microsoft.com" })).toBeNull();
    expect(refuseSignIn({ accountType: "teacher", signInProvider: "microsoft.com" })).toBeNull();
  });
});
