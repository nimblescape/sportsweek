/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { MasterDataView } from "@/components/master-data/master-data-view";

export default async function ClassesPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;

  return <MasterDataView category="classes" eventSeriesId={eventSeriesId} />;
}
