/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";

export type SignInRefusal = { reason: string; message: string };

export type SignInAttempt = {
  /** Set by Firebase during the token exchange, so a caller cannot claim it. */
  signInProvider?: string;
  /** Unused here; a test environment's own policy narrows staff further by it. */
  email?: string;
};

/** Entra ID, the school's own directory, and in production the only identity that counts. */
const ENTRA_ID = "microsoft.com";

/** What a caller hears when their provider is not one this deployment trusts. */
const UNTRUSTED_PROVIDER: SignInRefusal = {
  reason: "untrusted-provider",
  message: "Anmeldung nur über Office 365 möglich.",
};

/**
 * Whether a provisioning attempt is refused for reasons particular to this environment.
 *
 * Production admits the school's directory and nothing else. The address a token asserts is
 * what decides whether somebody is staff, and every other provider Firebase offers lets the
 * account choose its own — an e-mail sign-up above all. Which of them a project has switched
 * on is settled in a console rather than in this repository, so the sign-in names the one it
 * trusts instead of assuming the rest are off.
 *
 * `next.config.ts` swaps the module for the test-environment rules where they apply — which
 * keeps `provisionUser` free of conditions that can only ever be false in production.
 *
 * Async because the test-environment policy this is swapped for reads a database; production
 * needs none of it, but the two must answer the same shape.
 */
export async function refuseSignIn({
  signInProvider,
}: SignInAttempt): Promise<SignInRefusal | null> {
  return signInProvider === ENTRA_ID ? null : UNTRUSTED_PROVIDER;
}
