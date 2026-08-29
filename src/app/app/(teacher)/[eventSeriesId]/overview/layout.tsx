/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";

/** What the series looks like so far (US-12), which is reading the registrations. */
export default async function OverviewLayout({ children }: { children: ReactNode }) {
  await requirePermission("viewReports");

  return <>{children}</>;
}
