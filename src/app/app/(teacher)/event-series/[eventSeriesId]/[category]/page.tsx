/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { notFound } from "next/navigation";
import { ClassTeachersView } from "@/components/master-data/class-teachers-view";
import { EventsView } from "@/components/master-data/events-view";
import { MasterDataView } from "@/components/master-data/master-data-view";
import { ProgramEquipmentView } from "@/components/master-data/program-equipment-view";
import { ProgramsView } from "@/components/master-data/programs-view";
import { masterDataCategorySchema } from "@/lib/master-data/categories";
import { classTeachersPath } from "@/lib/master-data/hierarchy";

/**
 * One category of one event series (US-33). The category is a segment because it is a name this
 * application owns; the program whose equipment is open is a search parameter, because its name
 * is one a teacher typed and may hold a slash (US-21). A class's teachers follow the same rule
 * (US-38).
 */
export default async function MasterDataCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSeriesId: string; category: string }>;
  searchParams: Promise<{ equipment?: string; teachers?: string }>;
}) {
  const { eventSeriesId, category } = await params;
  const parsed = masterDataCategorySchema.safeParse(category);
  if (!parsed.success) notFound();

  const { equipment, teachers } = await searchParams;

  if (parsed.data === "events") {
    return <EventsView eventSeriesId={eventSeriesId} />;
  }

  if (parsed.data === "programs") {
    return equipment === undefined ? (
      <ProgramsView eventSeriesId={eventSeriesId} />
    ) : (
      <ProgramEquipmentView program={equipment} eventSeriesId={eventSeriesId} />
    );
  }

  if (parsed.data === "classes") {
    return teachers === undefined ? (
      <MasterDataView
        category="classes"
        eventSeriesId={eventSeriesId}
        openHref={(item) => classTeachersPath(eventSeriesId, item.name)}
      />
    ) : (
      <ClassTeachersView class={teachers} eventSeriesId={eventSeriesId} />
    );
  }

  return <MasterDataView category={parsed.data} eventSeriesId={eventSeriesId} />;
}
