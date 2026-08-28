/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { AppShell } from "@/components/layout/app-shell";
import { EventSeriesTagRows } from "@/components/layout/event-series-tag-rows";
import { requireUser } from "@/lib/auth/guards";

// Both roles share this header; the teacher-only navigation is added by a nested layout (US-14, US-15).
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();

  // Students manage no event series and reach their registration through a link (US-20, US-23).
  return (
    <AppShell scope={user.role === "teacher" ? <EventSeriesTagRows /> : null}>{children}</AppShell>
  );
}
