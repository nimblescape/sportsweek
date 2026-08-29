/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requireAnyPermission } from "@/lib/auth/guards";
import { PAGE_PERMISSIONS } from "@/lib/auth/reachable-pages";

/**
 * Reading the report (US-13). Either of two permissions opens it; saving what has been set up is
 * the stronger one, and the handler that stores it asks for that by name.
 */
export default async function ReportLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission(PAGE_PERMISSIONS.report);

  return <>{children}</>;
}
