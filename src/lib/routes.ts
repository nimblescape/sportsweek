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
  statistics: "/app/statistics",
  masterData: "/app/master-data",
  myRegistration: "/app/my-registration",
} as const;

export const TEACHER_ONLY_PREFIXES = [
  ROUTES.report,
  ROUTES.assignment,
  ROUTES.statistics,
  ROUTES.masterData,
] as const;

// A teacher never registers for an event series, so this page is student-only (US-15).
export const STUDENT_ONLY_PREFIXES = [ROUTES.myRegistration] as const;

export function homeFor(role: UserRole): string {
  return role === "teacher" ? ROUTES.report : ROUTES.myRegistration;
}

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
