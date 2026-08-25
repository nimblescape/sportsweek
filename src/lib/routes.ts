/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { UserRole } from "@/lib/schemas/user";

export const ROUTES = {
  signIn: "/sign-in",
  appRoot: "/app",
  report: "/app/report",
  assignment: "/app/assignment",
  masterData: "/app/master-data",
  studentMasterData: "/app/my-master-data",
} as const;

/** One sub-item per teacher-maintained category (US-4 to US-10). */
export const MASTER_DATA_SECTIONS = [
  { href: "/app/master-data/seasons", label: "Saisonen" },
  { href: "/app/master-data/programs", label: "Programme" },
  { href: "/app/master-data/classes", label: "Klassen" },
  { href: "/app/master-data/skill-levels", label: "Könnensstufen" },
  { href: "/app/master-data/bus-pickup-points", label: "Zustiegsstellen" },
  { href: "/app/master-data/food-options", label: "Verpflegung" },
  { href: "/app/master-data/season-pass-options", label: "Saisonkarten" },
] as const;

export const TEACHER_ONLY_PREFIXES = [ROUTES.report, ROUTES.assignment, ROUTES.masterData] as const;

// A teacher has no master data record of their own, so this page is student-only (US-15).
export const STUDENT_ONLY_PREFIXES = [ROUTES.studentMasterData] as const;

export function homeFor(role: UserRole): string {
  return role === "teacher" ? ROUTES.report : ROUTES.studentMasterData;
}

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
