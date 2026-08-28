/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ProgramEquipmentView } from "@/components/master-data/program-equipment-view";
import { ProgramsView } from "@/components/master-data/programs-view";

/**
 * A program is identified by its name (US-21), and a name may contain a slash — so the one that
 * has its equipment open is named in a search parameter rather than in a path segment.
 */
export default async function ProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSeriesId: string }>;
  searchParams: Promise<{ equipment?: string }>;
}) {
  const { eventSeriesId } = await params;
  const { equipment } = await searchParams;

  return equipment === undefined ? (
    <ProgramsView eventSeriesId={eventSeriesId} />
  ) : (
    <ProgramEquipmentView program={equipment} eventSeriesId={eventSeriesId} />
  );
}
