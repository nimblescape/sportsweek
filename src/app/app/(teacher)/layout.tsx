/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireTeacher } from "@/lib/auth/guards";
import { EVENT_SERIES_COOKIE_NAME } from "@/lib/event-series/event-series-selection";
import { TeacherNav } from "@/components/layout/teacher-nav";

// Guards the whole teacher area; the proxy check ahead of it is optimistic only.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireTeacher();
  // This layout sits above the series id segment, so on the event series list — the one page not
  // scoped to a selection — the cookie is the only thing that still knows which series to link to.
  const lastEventSeriesId = (await cookies()).get(EVENT_SERIES_COOKIE_NAME)?.value ?? null;

  return (
    <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
      {/* The width lives on the nav, which is what decides whether it is collapsed. The height is
          spelled out rather than stretched: Safari will not carry a stretch down through the
          scrolling column above, and the bar's last row has to reach the foot of the window. */}
      <aside className="border-border shrink-0 border-b md:flex md:h-[calc(100dvh-var(--header-height))] md:border-r md:border-b-0">
        <TeacherNav lastEventSeriesId={lastEventSeriesId} />
      </aside>
      {/* min-w-0: without it the column is floored at the width of its widest table and the
          row overflows, so narrowing the bar beside it hands the content no room back. */}
      <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">{children}</div>
    </div>
  );
}
