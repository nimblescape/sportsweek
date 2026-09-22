/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { invitationKey } from "../school-email";
// By the real path, not "@/lib/auth/sign-in-policy": that specifier is what next.config.ts
// redirects to this file, so importing it here would be this module importing itself.
import { refuseSignIn as secureDefault } from "../sign-in-policy";
import type { SignInAttempt, SignInRefusal } from "../sign-in-policy";

/** The token this project's own server signs, which is the one thing a fake login can mint. */
const SERVER_SIGNED = "custom";

/** What a real Entra ID sign-in hears when this deployment does not already know it. */
const STAGING_RESTRICTED: SignInRefusal = {
  reason: "staging-restricted",
  message:
    "Dies ist die Testumgebung.\n\n" +
    "Bitte über\nhttps://sportsweek.htldornbirn.org\nanmelden.\n\n" +
    "Für einen Zugang zur Testumgebung bitte an das Entwicklerteam wenden.\n\n" +
    "Danke.",
};

/**
 * Whether an address is on this deployment's own, permanent list of allowed accounts — kept
 * apart from `invitedTeachers` and `users`, which turn over as people are provisioned and sign
 * in. This one does not, so it stays the same account across as many sign-ins as it takes.
 */
async function isAllowed(email: string): Promise<boolean> {
  const doc = await adminDb.collection(COLLECTIONS.stagingLogins).doc(invitationKey(email)).get();

  return doc.exists;
}

/**
 * A test environment trusts one provider more than production does: the token this project's own
 * server signs, which is the whole of what a fake login can mint, and impersonating with one is
 * already a teacher-only capability — see `entraTeacherCookie` in the fake-login route. Nothing
 * here narrows that further; only a genuine Entra ID sign-in is checked against `stagingLogins`,
 * because that is the one credential a caller cannot already have been refused.
 *
 * Everything the production policy refuses is still refused here, so tightening production
 * tightens these environments too and cannot be forgotten in one of them.
 *
 * A test environment carries real people's data, so a real Entra ID sign-in is narrowed beyond
 * what production asks of it: only an address on `stagingLogins` may sign in as itself, of
 * whatever account type, and everyone else's own Office 365 account is turned back to production
 * instead — before it ever reaches a session, and so before it could ever reach impersonation.
 *
 * There is no check here for which project this is. The build already decided that by
 * resolving this module at all, and `resolveAuthMode` never resolves it for production.
 */
export async function refuseSignIn(attempt: SignInAttempt): Promise<SignInRefusal | null> {
  if (attempt.signInProvider === SERVER_SIGNED) return null;

  const refusal = await secureDefault(attempt);
  if (refusal) return refusal;

  const email = attempt.email?.trim().toLowerCase();
  if (!email) return STAGING_RESTRICTED;

  return (await isAllowed(email)) ? null : STAGING_RESTRICTED;
}
