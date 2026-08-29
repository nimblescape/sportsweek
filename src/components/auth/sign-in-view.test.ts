/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";

// Only the identity of the component matters here, and reaching it would otherwise
// initialise Firebase.
vi.mock("@/lib/firebase/client", () => ({ auth: {}, createMicrosoftAuthProvider: () => ({}) }));

const { SignInCard } = await import("@/components/auth/sign-in-card");
const { SignInView } = await import("@/components/auth/sign-in-view");

/**
 * What a build resolves to unless `next.config.ts` aliases the fake login in. An alias that
 * stopped matching would leave this standing, which is why it is the ordinary screen.
 */
describe("the sign-in view a build resolves by default", () => {
  it("is the production sign-in card", () => {
    expect(SignInView).toBe(SignInCard);
  });
});
