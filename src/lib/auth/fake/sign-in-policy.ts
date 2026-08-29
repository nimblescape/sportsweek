/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { SignInAttempt, SignInRefusal } from "@/lib/auth/sign-in-policy";

/**
 * A test environment holds invented people and unfinished work, so a student's own account is
 * turned away — while an impersonated student is exactly what the environment is for.
 *
 * `signInProvider` separates the two: Firebase sets it during the token exchange, so a caller
 * cannot assert `microsoft.com` without having been through Entra ID.
 *
 * There is no check here for which project this is. The build already decided that by
 * resolving this module at all, and `resolveAuthMode` never resolves it for production.
 */
export function refuseSignIn({ role, signInProvider }: SignInAttempt): SignInRefusal | null {
  if (role === "student" && signInProvider === "microsoft.com") {
    return {
      reason: "students-excluded",
      message: "Diese Umgebung steht nur Lehrpersonen offen.",
    };
  }

  return null;
}
