/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { RegistrationsView } from "@/components/registrations/registrations-view";

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;

  return <RegistrationsView eventSeriesId={eventSeriesId} />;
}
