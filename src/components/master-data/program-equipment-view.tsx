/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MasterDataView } from "@/components/master-data/master-data-view";
import { useMasterData } from "@/lib/master-data/use-master-data";

/** One program's required equipment items, on the same CRUD list every category uses (US-5). */
export function ProgramEquipmentView({ programId }: { programId: string }) {
  const { items: programs } = useMasterData("programs");
  const program = programs.find((candidate) => candidate.id === programId) ?? null;

  return (
    <MasterDataView
      category="required-equipment"
      parentId={programId}
      title={`Benötigte Ausrüstung – ${program?.name ?? "Programm"}`}
    >
      <Link
        href="/app/master-data/programs"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Alle Programme
      </Link>
    </MasterDataView>
  );
}
