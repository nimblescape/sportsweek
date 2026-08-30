/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { STUDENT_DOMAIN, TEACHER_DOMAIN } from "@/lib/auth/school-email";
import type { AccountType } from "@/lib/schemas/user";

/**
 * Inventing an address is something only an impersonation does — the real tenant issues them, and
 * production never invents one. It lives here so that reading `school-email.ts` shows what the
 * application does with an address, not what a test environment can make up.
 */

/** `firstname.lastname`, hyphens allowed inside either part — no digits, no other separators. */
const NAME_PART = "[a-z]+(?:-[a-z]+)*";
/** Everything the regex grammar gives meaning to, so a domain can only ever match itself. */
const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyDomainOf = (...domains: string[]) => `(?:${domains.map(escapeForRegExp).join("|")})`;
const SCHOOL_EMAIL = new RegExp(
  `^${NAME_PART}\\.${NAME_PART}@${anyDomainOf(TEACHER_DOMAIN, STUDENT_DOMAIN)}$`,
);

/** The shape the school's tenant issues, and the only one an impersonation may mint. */
export function isSchoolEmail(email: string): boolean {
  return SCHOOL_EMAIL.test(email.trim().toLowerCase());
}

// Written out rather than folded away, so "Müller" does not collapse into "muller".
// Applied before the generic diacritic strip below.
const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

function toNamePart(name: string): string | null {
  const part = name
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => TRANSLITERATIONS[char])
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return part || null;
}

/**
 * Derives the address the tenant would issue for a person (US-3). Null when a name carries no
 * character the local part's alphabet can represent.
 */
export function buildEmail(
  firstName: string,
  lastName: string,
  accountType: AccountType,
): string | null {
  const first = toNamePart(firstName);
  const last = toNamePart(lastName);
  if (!first || !last) return null;

  return `${first}.${last}@${accountType === "teacher" ? TEACHER_DOMAIN : STUDENT_DOMAIN}`;
}
