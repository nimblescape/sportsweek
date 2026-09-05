/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { CrudList, type CrudItem } from "@/components/master-data/crud-list";
import { apiRequest } from "@/lib/api/client";
import { EQUIPMENT_LABELS } from "@/lib/master-data/categories";
import { equipmentTabs, programTrail } from "@/lib/master-data/hierarchy";
import { useProgram, useUsageReport } from "@/lib/master-data/use-master-data";
import { useSelectedEventSeries } from "@/lib/event-series/use-selected-event-series";
import { IRREVERSIBLE_HINT } from "@/lib/ui/hints";

/**
 * A program's required equipment, the leaf of the master data hierarchy (US-5, US-33). The
 * entries live in a field on the program, so every change rewrites the whole list — which is what
 * makes adding, renaming and removing one atomic, and uniqueness checkable without a query.
 */
export function ProgramEquipmentView({
  program: named,
  eventSeriesId,
}: {
  program: string;
  eventSeriesId: string;
}) {
  const { program, loading, error } = useProgram(named, eventSeriesId);
  const report = useUsageReport("programs", eventSeriesId);
  const { eventSeries } = useSelectedEventSeries(eventSeriesId);

  const equipment = program?.requiredEquipment ?? [];
  // An entry has no id of its own, so its name is what identifies it within the program.
  const items: CrudItem[] = equipment.map((name) => ({ id: name, name }));
  const blockedIds = new Set(report.blockedEquipment[named] ?? []);

  async function save(names: string[]) {
    await apiRequest(
      `/api/event-series/${encodeURIComponent(eventSeriesId)}/master-data/programs`,
      {
        method: "PATCH",
        body: { item: named, requiredEquipment: names },
      },
    );
  }

  return (
    <CrudList
      trail={programTrail(eventSeriesId, eventSeries?.name ?? "", named)}
      title={named}
      tabs={equipmentTabs(eventSeriesId, named)}
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
