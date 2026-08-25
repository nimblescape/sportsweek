/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { homeFor } from "@/lib/routes";

// Role-based landing (US-14, US-15): teachers start on the dashboard, students on their master data.
export default async function AppLandingPage() {
  const user = await requireUser();
  redirect(homeFor(user.role));
}
