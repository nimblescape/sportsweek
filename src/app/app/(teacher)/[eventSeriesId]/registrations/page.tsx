/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { RegistrationsView } from "@/components/registrations/registrations-view";
import { requirePermission } from "@/lib/auth/guards";
import { asUid } from "@/lib/schemas/common";

// The layout guards the route; this asks the second question the page needs — whose classes
// narrow it (US-39).
export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const user = await requirePermission("editRegistrations");

  return <RegistrationsView eventSeriesId={eventSeriesId} teacherUid={asUid(user.uid)} />;
}
