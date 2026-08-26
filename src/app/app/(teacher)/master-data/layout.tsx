/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { seedMasterDataDefaults } from "@/lib/master-data/seed-defaults";

/**
 * Brings a fresh environment up with the documented defaults (US-5, US-7 to US-10) the first
 * time a teacher opens this section. Seeding is idempotent and costs a single read once it has
 * run, and a failure only means missing defaults — not a section the teacher cannot open.
 */
export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  try {
    await seedMasterDataDefaults();
  } catch (error) {
    console.error("Seeding the master data defaults failed:", error);
  }

  return children;
}
