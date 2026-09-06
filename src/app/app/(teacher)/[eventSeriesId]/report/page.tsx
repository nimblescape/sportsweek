/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ScopedEventSeriesPage } from "@/components/layout/scoped-event-series-page";
import { ReportView } from "@/components/report/report-view";
import { requireAnyPermission } from "@/lib/auth/guards";
import { may } from "@/lib/auth/permissions";
import { PAGE_PERMISSIONS } from "@/lib/auth/reachable-pages";
import { asUid } from "@/lib/schemas/common";

// The layout guards the route; this asks the second question the page needs — whether what is
// set up here may also be kept (US-13, US-2), whose classes narrow it (US-39), and whether this
// series is one they are scoped to at all (US-42).
export default async function ReportPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requireAnyPermission(PAGE_PERMISSIONS.report);
  const teacherUid = asUid(user.uid);

  return (
    <ScopedEventSeriesPage eventSeriesId={eventSeriesId} teacherUid={teacherUid}>
      <ReportView
        eventSeriesId={eventSeriesId}
        mayEdit={may(user, "editReports")}
        teacherUid={teacherUid}
      />
    </ScopedEventSeriesPage>
  );
}
