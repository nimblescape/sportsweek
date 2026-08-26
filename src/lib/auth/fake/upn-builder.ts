/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { STUDENT_DOMAIN, TEACHER_DOMAIN } from "@/lib/auth/upn";
import type { UserRole } from "@/lib/schemas/user";

/**
 * Deriving a UPN is something only an impersonation does — the real tenant issues them, and
 * production never invents one. It lives here so that reading `upn.ts` shows what the
 * application does with a UPN, not what a test environment can make up.
 */

/** `firstname.lastname`, hyphens allowed inside either part — no digits, no other separators. */
const NAME_PART = "[a-z]+(?:-[a-z]+)*";
/** Everything the regex grammar gives meaning to, so a domain can only ever match itself. */
const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyDomainOf = (...domains: string[]) => `(?:${domains.map(escapeForRegExp).join("|")})`;
const SCHOOL_UPN = new RegExp(
  `^${NAME_PART}\\.${NAME_PART}@${anyDomainOf(TEACHER_DOMAIN, STUDENT_DOMAIN)}$`,
);

/** The shape the school's tenant issues, and the only one an impersonation may mint. */
export function isSchoolUpn(upn: string): boolean {
  return SCHOOL_UPN.test(upn.trim().toLowerCase());
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
 * Derives the UPN the tenant would issue for a person (US-3). Null when a name carries no
 * character the UPN alphabet can represent.
 */
export function buildUpn(firstName: string, lastName: string, role: UserRole): string | null {
  const first = toNamePart(firstName);
  const last = toNamePart(lastName);
  if (!first || !last) return null;

  return `${first}.${last}@${role === "teacher" ? TEACHER_DOMAIN : STUDENT_DOMAIN}`;
}
