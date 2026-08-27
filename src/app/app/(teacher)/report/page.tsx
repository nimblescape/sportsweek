/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ReportView } from "@/components/report/report-view";

// The teacher layout guards this route; the report itself is scoped to the active season (US-13).
export default function ReportPage() {
  return <ReportView />;
}
