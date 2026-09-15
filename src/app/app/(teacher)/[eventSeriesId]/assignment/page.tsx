/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ScopedEventSeriesPage } from "@/components/layout/scoped-event-series-page";
import { AssignmentView } from "@/components/assignment/assignment-view";
import { requirePermission } from "@/lib/auth/guards";
import { asUid } from "@/lib/schemas/common";

// The layout guards the route; this asks the second question the page needs — whose classes
// narrow it (US-39), and whether this series is one they are scoped to at all (US-42).
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requirePermission("editAssignments");
  const teacherUid = asUid(user.uid);

  return (
    <ScopedEventSeriesPage eventSeriesId={eventSeriesId} teacherUid={teacherUid}>
      <AssignmentView eventSeriesId={eventSeriesId} teacherUid={teacherUid} />
    </ScopedEventSeriesPage>
  );
}
