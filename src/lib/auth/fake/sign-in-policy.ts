/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
// By the real path, not "@/lib/auth/sign-in-policy": that specifier is what next.config.ts
// redirects to this file, so importing it here would be this module importing itself.
import { refuseSignIn as secureDefault } from "../sign-in-policy";
import type { SignInAttempt, SignInRefusal } from "../sign-in-policy";

/** The token this project's own server signs, which is the one thing a fake login can mint. */
const SERVER_SIGNED = "custom";

/**
 * A test environment holds invented people and unfinished work, so a student's own account is
 * turned away — while an impersonated student is exactly what the environment is for.
 *
 * `signInProvider` separates the two: Firebase sets it during the token exchange, so a caller
 * cannot assert `microsoft.com` without having been through Entra ID.
 *
 * Everything the production policy refuses is still refused here; this adds the one provider
 * that a fake login needs and asks one further question. Tightening production therefore
 * tightens these environments too, and cannot be forgotten in one of them.
 *
 * There is no check here for which project this is. The build already decided that by
 * resolving this module at all, and `resolveAuthMode` never resolves it for production.
 */
export function refuseSignIn(attempt: SignInAttempt): SignInRefusal | null {
  if (attempt.signInProvider !== SERVER_SIGNED) {
    const refusal = secureDefault(attempt);
    if (refusal) return refusal;
  }

  if (attempt.accountType === "student" && attempt.signInProvider === "microsoft.com") {
    return {
      reason: "students-excluded",
      message: "Diese Umgebung steht nur Lehrpersonen offen.",
    };
  }

  return null;
}
