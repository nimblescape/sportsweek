/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { CrudList, type CrudItem } from "@/components/master-data/crud-list";
import { apiRequest } from "@/lib/api/client";
import { EQUIPMENT_LABELS } from "@/lib/master-data/categories";
import {
  equipmentTabs,
  eventEquipmentTabs,
  eventEquipmentTrail,
  programTrail,
} from "@/lib/master-data/hierarchy";
import { useProgram, useUsageReport } from "@/lib/master-data/use-master-data";
import { useSelectedEventSeries } from "@/lib/event-series/use-selected-event-series";
import { IRREVERSIBLE_HINT } from "@/lib/ui/hints";

/**
 * A program's required equipment, the leaf of the master data hierarchy (US-5, US-33) — the
 * series' own program, or one of an event's own. The entries live in a field on the program, so
 * every change rewrites the whole list — which is what makes adding, renaming and removing one
 * atomic, and uniqueness checkable without a query.
 */
export function ProgramEquipmentView({
  program: named,
  eventSeriesId,
  eventName,
}: {
  program: string;
  eventSeriesId: string;
  /** Undefined for the series' own program; one of an event's own names itself instead (US-33). */
  eventName?: string;
}) {
  const { program, loading, error } = useProgram(named, eventSeriesId, eventName);
  const report = useUsageReport("programs", eventSeriesId, eventName);
  const { eventSeries } = useSelectedEventSeries(eventSeriesId);
  const seriesName = eventSeries?.name ?? "";

  const equipment = program?.requiredEquipment ?? [];
  // An entry has no id of its own, so its name is what identifies it within the program.
  const items: CrudItem[] = equipment.map((name) => ({ id: name, name }));
  const blockedIds = new Set(report.blockedEquipment[named] ?? []);

  const endpoint =
    eventName === undefined
      ? `/api/event-series/${encodeURIComponent(eventSeriesId)}/master-data/programs`
      : `/api/event-series/${encodeURIComponent(eventSeriesId)}/events/master-data/programs` +
        `?event=${encodeURIComponent(eventName)}`;
  const trail =
    eventName === undefined
      ? programTrail(eventSeriesId, seriesName, named)
      : eventEquipmentTrail(eventSeriesId, seriesName, eventName, named);
  const tabs =
    eventName === undefined
      ? equipmentTabs(eventSeriesId, named)
      : eventEquipmentTabs(eventSeriesId, eventName, named);

  async function save(names: string[]) {
    await apiRequest(endpoint, {
      method: "PATCH",
      body: { item: named, requiredEquipment: names },
    });
  }

  return (
    <CrudList
      trail={trail}
      tabs={tabs}
      marked="required-equipment"
      labels={EQUIPMENT_LABELS}
      items={items}
      loading={loading}
      error={error}
      blockedIds={blockedIds}
      usagePending={report.loading}
      onSubmit={(name, item) =>
        save(
          item === null ? [...equipment, name] : equipment.map((e) => (e === item.id ? name : e)),
        )
      }
      onDelete={(item) => save(equipment.filter((entry) => entry !== item.id))}
      onReorder={(order) => save(order)}
      deleteNote={(item) => (
        <>
          <strong>{item.name}</strong> wird aus der Ausrüstungsliste dieses Programms entfernt.{" "}
          {IRREVERSIBLE_HINT}
        </>
      )}
      editNote={(item) => (
        <>
          <strong>{item.name}</strong> wird umbenannt.
        </>
      )}
    />
  );
}
