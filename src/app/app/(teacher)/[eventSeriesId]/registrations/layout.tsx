/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";

/** Where registrations are invited and removed (US-12, US-23). */
export default async function OverviewLayout({ children }: { children: ReactNode }) {
  await requirePermission("editRegistrations");

  return <>{children}</>;
}
