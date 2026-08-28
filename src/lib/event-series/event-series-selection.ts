/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";
import { firstMasterDataPath } from "@/lib/master-data/categories";

/**
 * Which event series a teacher is working in lives in the URL (Q8), so a report can be linked to
 * and two tabs can show two series. This is the one place that knows the shape of those paths:
 * the header reads it to mark a tag, and the navigation reads it to build its links.
 */

/** Remembers the last selection, so `/app` can send a teacher back where they were (Q8). */
export const EVENT_SERIES_COOKIE_NAME = "sportsweek_event_series";

/**
 * Segments that sit beside an event series id rather than being one. Next.js prefers a static
 * segment over a dynamic one, so these resolve to their own pages — but the id has to be read
 * from the same position, and a Firestore id is never one of these words.
 */
const UNSCOPED_SEGMENTS: readonly string[] = [ROUTES.eventSeries, ROUTES.myRegistration].map(
  (route) => route.slice(`${ROUTES.appRoot}/`.length),
);

export function selectedEventSeriesIdFrom(pathname: string): string | null {
  const [, app, candidate] = pathname.split("/");
  if (app !== ROUTES.appRoot.slice(1) || !candidate) return null;
  if (UNSCOPED_SEGMENTS.includes(candidate)) return null;

  return decodeURIComponent(candidate);
}

/**
 * Whether the page is about what a series is made of rather than what its students answered.
 * The navigation marks its own section by it, and the header offers the templates only here:
 * a template holds lists and no registrations, so it has nothing an overview, an assignment or
 * a report could show (US-22).
 */
export function isMasterDataPath(pathname: string): boolean {
  if (pathname === ROUTES.eventSeries || pathname.startsWith(`${ROUTES.eventSeries}/`)) return true;

  const selected = selectedEventSeriesIdFrom(pathname);
  return selected !== null && pathname.startsWith(`${eventSeriesRoutes(selected).masterData}`);
}

/**
 * Where pressing a header tag goes. Selecting another series re-scopes the page that is open
 * rather than navigating away from it (US-20) — the teacher asked a different question about the
 * same view. From a page that is about no series there is no view to keep, so the overview opens:
 * it is where a series is run from (US-29).
 *
 * A template is the exception: it holds lists and no registrations (US-22), so it is only ever
 * scoped to the master data, which is also the only place its tag is offered.
 */
export function rescopedPath(pathname: string, eventSeriesId: string, isTemplate = false): string {
  const scope = `${ROUTES.appRoot}/${encodeURIComponent(eventSeriesId)}`;
  const rest = selectedEventSeriesIdFrom(pathname) === null ? [] : pathname.split("/").slice(3);
  const kept =
    rest.length === 0 ? eventSeriesRoutes(eventSeriesId).overview : `${scope}/${rest.join("/")}`;

  return isTemplate && !isMasterDataPath(kept) ? firstMasterDataPath(eventSeriesId) : kept;
}

/**
 * Remembers the selection so `/app` can restore it (Q8). Written from the browser because a
 * Server Component may not set a cookie, and this is a view preference rather than a credential.
 */
export function rememberEventSeries(eventSeriesId: string): void {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${EVENT_SERIES_COOKIE_NAME}=${encodeURIComponent(eventSeriesId)}; path=/; max-age=${oneYear}; samesite=lax`;
}
