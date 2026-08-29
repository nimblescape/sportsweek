/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { EventSeriesTagRows } from "@/components/layout/event-series-tag-rows";
import { TeacherNav } from "@/components/layout/teacher-nav";
import { requireUser, fetchUserPhoto } from "@/lib/auth/guards";
import { resolveSelectedEventSeriesId } from "@/lib/event-series/event-series-service";
import { EVENT_SERIES_COOKIE_NAME } from "@/lib/event-series/event-series-selection";

// Both roles share this frame; only a teacher is given a navigation bar (US-14, US-15).
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const isTeacher = user.accountType === "teacher";

  // Read here rather than below the series id, where the layout renders once and then not again
  // while the teacher moves about beneath it. Resolved rather than trusted: a teacher who has
  // remembered nothing yet, or remembered one since deleted, still gets a bar that points
  // somewhere.
  const remembered = isTeacher
    ? ((await cookies()).get(EVENT_SERIES_COOKIE_NAME)?.value ?? undefined)
    : undefined;
  const fallbackEventSeriesId = isTeacher ? await resolveSelectedEventSeriesId(remembered) : null;
  const photo = await fetchUserPhoto(user.email);

  // Students manage no event series and reach their registration through a link (US-20, US-23).
  return (
    <AppShell
      nav={
        isTeacher ? (
          <TeacherNav
            fallbackEventSeriesId={fallbackEventSeriesId}
            permissions={user.permissions}
            photo={photo}
          />
        ) : null
      }
      scope={isTeacher ? <EventSeriesTagRows /> : null}
      photo={photo}
    >
      {children}
    </AppShell>
  );
}
