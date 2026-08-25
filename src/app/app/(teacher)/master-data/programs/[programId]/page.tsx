/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ProgramEquipmentView } from "@/components/master-data/program-equipment-view";

export default async function ProgramEquipmentPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  return <ProgramEquipmentView programId={programId} />;
}
