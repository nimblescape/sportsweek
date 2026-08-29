/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { UserRole } from "@/lib/schemas/user";

export const ROUTES = {
  signIn: "/sign-in",
  appRoot: "/app",
  eventSeries: "/app/event-series",
  myRegistration: "/app/my-registration",
} as const;

/**
 * The pages a teacher works in are scoped to the selected event series, so their paths carry its
 * id (Q8) and there is no fixed prefix left to list. What can be listed is the far shorter set a
 * student may reach — so everything else under `/app` is a teacher's, and a page nobody has
 * thought about yet is guarded by existing rather than by being remembered here (US-15).
 */
export const STUDENT_ONLY_PREFIXES = [ROUTES.myRegistration] as const;

/** The pages beneath a selected event series. The id is a segment, so these are built, not stored. */
export function eventSeriesRoutes(eventSeriesId: string) {
  const scope = `${ROUTES.appRoot}/${encodeURIComponent(eventSeriesId)}`;
  return {
    report: `${scope}/report`,
    assignment: `${scope}/assignment`,
    overview: `${scope}/overview`,
    masterData: `${scope}/master-data`,
  };
}

/**
 * A teacher lands on `/app`, which resolves the selection and sends them on, because which series
 * they were last in is not something the sign-in knows.
 */
export function homeFor(role: UserRole): string {
  return role === "teacher" ? ROUTES.appRoot : ROUTES.myRegistration;
}

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
