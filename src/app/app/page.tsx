/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/guards";
import { firstReachableHref } from "@/lib/auth/reachable-pages";
import { resolveSelectedEventSeriesId } from "@/lib/event-series/event-series-service";
import { EVENT_SERIES_COOKIE_NAME } from "@/lib/event-series/event-series-selection";
import { ROUTES } from "@/lib/routes";

export const NO_PERMISSIONS_HINT =
  "Für dich ist noch nichts freigeschaltet. Bitte wende dich an eine Person mit Administrationsrechten.";

/**
 * Where each account type lands (US-14, US-15). A teacher's pages are all about one event
 * series, and which one they were last in is not something signing in knows — so the cookie is
 * read here and turned into a scoped destination (Q8).
 *
 * Which of those pages they may open is a second question, and one that has to be asked here:
 * sending a teacher to a page their permissions refuse would bounce them back to this one, and
 * round again. A teacher holding nothing is told so instead (US-2).
 */
export default async function AppLandingPage() {
  const user = await requireUser();
  if (user.accountType !== "teacher") redirect(ROUTES.myRegistration);

  const remembered = (await cookies()).get(EVENT_SERIES_COOKIE_NAME)?.value;
  const eventSeriesId = await resolveSelectedEventSeriesId(remembered);
  const destination = firstReachableHref(user.permissions, eventSeriesId);

  if (destination !== null) redirect(destination);

  return <p className="text-muted-foreground text-sm">{NO_PERMISSIONS_HINT}</p>;
}
