/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";

/** The seven lists of one event series (US-4 to US-10), which are master data to maintain. */
export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  await requirePermission("editMasterData");

  return <>{children}</>;
}
