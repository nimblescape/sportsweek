/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";

/**
 * Reading the report (US-13). Saving one is a second permission, checked by the handler that
 * stores it rather than here — the page is the same page either way.
 */
export default async function ReportLayout({ children }: { children: ReactNode }) {
  await requirePermission("viewReports");

  return <>{children}</>;
}
