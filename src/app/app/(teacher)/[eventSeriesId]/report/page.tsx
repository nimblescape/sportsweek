/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ReportView } from "@/components/report/report-view";
import { requireAnyPermission } from "@/lib/auth/guards";
import { may } from "@/lib/auth/permissions";
import { PAGE_PERMISSIONS } from "@/lib/auth/reachable-pages";

// The layout guards the route; this asks the second question the page needs — whether what is
// set up here may also be kept (US-13, US-2).
export default async function ReportPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requireAnyPermission(PAGE_PERMISSIONS.report);

  return <ReportView eventSeriesId={eventSeriesId} mayEdit={may(user, "editReports")} />;
}
