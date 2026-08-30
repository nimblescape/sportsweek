/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { AccountType } from "@/lib/schemas/user";

export const TEACHER_DOMAIN = "htldornbirn.at";
export const STUDENT_DOMAIN = "student.htldornbirn.at";

/**
 * Derives the role from an Entra ID UPN (US-3).
 * The domain must match exactly, so lookalikes such as `evil-htldornbirn.at`,
 * `mail.htldornbirn.at` or `htldornbirn.at.evil.com` are rejected.
 *
 * `isSchoolUpn` in firestore.rules spells both domains out a second time, because a rules file
 * cannot import this one; a domain changed here has to be carried over there by hand.
 */
export function accountTypeFromUpn(upn: string): AccountType | null {
  const parts = upn.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return null;

  if (domain === TEACHER_DOMAIN) return "teacher";
  if (domain === STUDENT_DOMAIN) return "student";
  return null;
}
