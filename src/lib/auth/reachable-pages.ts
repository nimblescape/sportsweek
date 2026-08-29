/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";
import { may, type Permission } from "@/lib/auth/permissions";

/** The pages a teacher can be sent to, in the order the navigation shows them. */
export type PageKey = "overview" | "assignment" | "report" | "masterData" | "users";

export const PAGE_PERMISSION: Record<PageKey, Permission> = {
  overview: "viewReports",
  assignment: "editAssignments",
  report: "viewReports",
  masterData: "editMasterData",
  users: "editUsers",
};

const PAGE_ORDER = Object.keys(PAGE_PERMISSION) as PageKey[];

export function reachablePages(permissions: readonly Permission[]): PageKey[] {
  const holder = { accountType: "teacher", permissions } as const;
  return PAGE_ORDER.filter((page) => may(holder, PAGE_PERMISSION[page]));
}

/**
 * Where a teacher goes when they have named no page themselves — landing on `/app`, or opening
 * a collapsed navigation bar. Null when they may open nothing, which is the state a teacher is
 * provisioned in and is answered with an explanation rather than a redirect that would loop.
 *
 * Everything but the rights page is about one event series, so with none selected only that one
 * and the list a series can be made in are left.
 */
export function firstReachableHref(
  permissions: readonly Permission[],
  eventSeriesId: string | null,
): string | null {
  const reachable = reachablePages(permissions);
  if (reachable.length === 0) return null;

  if (eventSeriesId === null) {
    if (reachable.includes("users")) return `${ROUTES.appRoot}/users`;
    return reachable.includes("masterData") ? ROUTES.eventSeries : null;
  }

  const scoped = eventSeriesRoutes(eventSeriesId);
  const hrefs: Record<PageKey, string> = {
    overview: scoped.overview,
    assignment: scoped.assignment,
    report: scoped.report,
    masterData: ROUTES.eventSeries,
    users: `${ROUTES.appRoot}/users`,
  };

  return hrefs[reachable[0]];
}
