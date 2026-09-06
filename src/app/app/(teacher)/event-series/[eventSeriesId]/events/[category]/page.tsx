/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { notFound } from "next/navigation";
import { MasterDataView } from "@/components/master-data/master-data-view";
import { ProgramEquipmentView } from "@/components/master-data/program-equipment-view";
import { ProgramsView } from "@/components/master-data/programs-view";
import { eventCategorySchema } from "@/lib/master-data/categories";

/**
 * One of the five categories an event may override in place of the series' (US-33). `events` is
 * a static segment ahead of `{category}`, and the event itself is a search parameter rather than
 * a segment, since its name is one a teacher typed and may hold a slash (see hierarchy.ts).
 */
export default async function EventCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSeriesId: string; category: string }>;
  searchParams: Promise<{ event?: string; equipment?: string }>;
}) {
  const { eventSeriesId, category } = await params;
  const parsed = eventCategorySchema.safeParse(category);
  if (!parsed.success) notFound();

  const { event, equipment } = await searchParams;
  if (event === undefined) notFound();

  if (parsed.data === "programs") {
    return equipment === undefined ? (
      <ProgramsView eventSeriesId={eventSeriesId} eventName={event} />
    ) : (
      <ProgramEquipmentView program={equipment} eventSeriesId={eventSeriesId} eventName={event} />
    );
  }

  return <MasterDataView category={parsed.data} eventSeriesId={eventSeriesId} eventName={event} />;
}
