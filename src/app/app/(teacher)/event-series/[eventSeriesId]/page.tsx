/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { eventSeriesRecordPath } from "@/lib/master-data/hierarchy";

// The record has no view of its own; it opens on the first of its child collections (US-33).
export default async function EventSeriesRecordPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;

  redirect(eventSeriesRecordPath(eventSeriesId));
}
