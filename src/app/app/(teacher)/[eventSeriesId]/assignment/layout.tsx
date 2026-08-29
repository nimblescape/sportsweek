/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";

/** Planning who goes to which event (US-12). */
export default async function AssignmentLayout({ children }: { children: ReactNode }) {
  await requirePermission("editAssignments");

  return <>{children}</>;
}
