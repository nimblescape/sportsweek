/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/guards";
import { resolveSelectedEventSeriesId } from "@/lib/event-series/event-series-service";
import { EVENT_SERIES_COOKIE_NAME } from "@/lib/event-series/event-series-selection";
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";

/**
 * Role-based landing (US-14, US-15). A teacher's pages are all about one event series, and which
 * one they were last in is not something signing in knows — so the cookie is read here and turned
 * into a scoped destination (Q8). With no series to select, the list is where they can make one.
 */
export default async function AppLandingPage() {
  const user = await requireUser();
  if (user.accountType !== "teacher") redirect(ROUTES.myRegistration);

  const remembered = (await cookies()).get(EVENT_SERIES_COOKIE_NAME)?.value;
  const eventSeriesId = await resolveSelectedEventSeriesId(remembered);

  redirect(eventSeriesId === null ? ROUTES.eventSeries : eventSeriesRoutes(eventSeriesId).overview);
}
