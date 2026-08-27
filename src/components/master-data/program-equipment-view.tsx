/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CrudList, type CrudItem } from "@/components/master-data/crud-list";
import { apiRequest } from "@/lib/api/client";
import { EQUIPMENT_LABELS } from "@/lib/master-data/categories";
import { useProgram, useUsageReport } from "@/lib/master-data/use-master-data";

/**
 * A program's required equipment on the same CRUD list every category uses (US-5). The entries
 * live in a field on the program, so every change rewrites the whole list — which is what makes
 * adding, renaming and removing one atomic, and uniqueness checkable without a query.
 */
export function ProgramEquipmentView({ programId }: { programId: string }) {
  const { program, loading, error } = useProgram(programId);
  const report = useUsageReport("programs");

  const equipment = program?.requiredEquipment ?? [];
  // An entry has no id of its own, so its name is what identifies it within the program.
  const items: CrudItem[] = equipment.map((name) => ({ id: name, name }));
  const blockedIds = new Set(report.blockedEquipment[programId] ?? []);

  async function save(names: string[]) {
    await apiRequest(`/api/master-data/programs/${programId}`, {
      method: "PATCH",
      body: { requiredEquipment: names },
    });
  }

  return (
    <CrudList
      labels={EQUIPMENT_LABELS}
      title={`${EQUIPMENT_LABELS.title} – ${program?.name ?? "Programm"}`}
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
          <strong>{item.name}</strong> wird aus der Ausrüstungsliste dieses Programms entfernt.
          Bereits gespeicherte Schüler:innendaten bleiben unverändert.
        </>
      )}
      editNote={(item) => (
        <>
          <strong>{item.name}</strong> wird umbenannt. Bereits gespeicherte Schüler:innendaten
          behalten den bisherigen Namen.
        </>
      )}
    >
      <Link
        href="/app/master-data/programs"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Alle Programme
      </Link>
    </CrudList>
  );
}
