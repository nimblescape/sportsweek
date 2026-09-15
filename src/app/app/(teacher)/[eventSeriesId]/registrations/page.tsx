/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ScopedEventSeriesPage } from "@/components/layout/scoped-event-series-page";
import { RegistrationsView } from "@/components/registrations/registrations-view";
import { requirePermission } from "@/lib/auth/guards";
import { asUid } from "@/lib/schemas/common";

// The layout guards the route; this asks the second question the page needs — whose classes
// narrow it (US-39), and whether this series is one they are scoped to at all (US-42).
export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requirePermission("editRegistrations");
  const teacherUid = asUid(user.uid);

  return (
    <ScopedEventSeriesPage eventSeriesId={eventSeriesId} teacherUid={teacherUid}>
      <RegistrationsView eventSeriesId={eventSeriesId} teacherUid={teacherUid} />
    </ScopedEventSeriesPage>
  );
}
