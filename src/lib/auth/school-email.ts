/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { AccountType } from "@/lib/schemas/user";

export const TEACHER_DOMAIN = "htldornbirn.at";
export const STUDENT_DOMAIN = "student.htldornbirn.at";

/**
 * Where an invitation waits for the person it names (US-2). The only key left that is an address
 * rather than a uid, and a document id is case-sensitive where an address is not — so both ends
 * ask this rather than folding it themselves, or an invitation is written where nobody reads.
 */
export const invitationKey = (email: string) => email.trim().toLowerCase();

/**
 * Derives the account type from the address the school issued (US-3).
 * The domain must match exactly, so lookalikes such as `evil-htldornbirn.at`,
 * `mail.htldornbirn.at` or `htldornbirn.at.evil.com` are rejected.
 *
 * The address is the ID token's `email` claim rather than Entra's `userPrincipalName`, which is
 * a different attribute the application never reads. The tenant issues both alike, so the domain
 * says the same thing either way — until the directory itself can be asked (US-32).
 *
 * The domains are named here and in no rule: firestore.rules asks provisioning's answer — the
 * `accountType` claim or a record — rather than testing an address a second time (US-32).
 */
export function accountTypeFromEmail(email: string): AccountType | null {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return null;

  if (domain === TEACHER_DOMAIN) return "teacher";
  if (domain === STUDENT_DOMAIN) return "student";
  return null;
}
