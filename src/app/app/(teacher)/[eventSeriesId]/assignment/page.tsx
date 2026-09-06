/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { AssignmentView } from "@/components/assignment/assignment-view";
import { requirePermission } from "@/lib/auth/guards";
import { asUid } from "@/lib/schemas/common";

// The layout guards the route; this asks the second question the page needs — whose classes
// narrow it (US-39).
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requirePermission("editAssignments");

  return <AssignmentView eventSeriesId={eventSeriesId} teacherUid={asUid(user.uid)} />;
}
