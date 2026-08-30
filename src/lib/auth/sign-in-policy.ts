/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { AccountType } from "@/lib/schemas/user";

export type SignInRefusal = { reason: string; message: string };

export type SignInAttempt = {
  accountType: AccountType;
  /** Set by Firebase during the token exchange, so a caller cannot claim it. */
  signInProvider?: string;
};

/**
 * Whether a provisioning attempt is refused for reasons particular to this environment.
 *
 * Production admits everyone the address's domain already allows, so this always returns null.
 * `next.config.ts` swaps the module for the test-environment rules where they apply — which
 * keeps `provisionUser` free of conditions that can only ever be false in production.
 */
export function refuseSignIn(_attempt: SignInAttempt): SignInRefusal | null {
  return null;
}
