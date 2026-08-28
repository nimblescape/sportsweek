/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { MASTER_DATA_CATEGORIES } from "@/lib/master-data/categories";

// The section itself has no view; it opens on the first category of the selected event series.
export default async function MasterDataIndexPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;
  const [firstCategory] = Object.keys(MASTER_DATA_CATEGORIES);

  redirect(`/app/${encodeURIComponent(eventSeriesId)}/master-data/${firstCategory}`);
}
