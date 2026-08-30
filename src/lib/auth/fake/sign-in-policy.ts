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
 * A test environment trusts one provider more than production does: the token this project's own
 * server signs, which is the whole of what a fake login can mint.
 *
 * Everything the production policy refuses is still refused here, so tightening production
 * tightens these environments too and cannot be forgotten in one of them. Who signed in is not
 * this policy's business — a student reaches the app by following an invitation link and signing
 * in as themselves (US-23), so turning that account away made the one flow with strangers in it
 * the one flow nobody could rehearse.
 *
 * There is no check here for which project this is. The build already decided that by
 * resolving this module at all, and `resolveAuthMode` never resolves it for production.
 */
export function refuseSignIn(attempt: SignInAttempt): SignInRefusal | null {
  return attempt.signInProvider === SERVER_SIGNED ? null : secureDefault(attempt);
}
