/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ROUTES } from "@/lib/routes";

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
