/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ROUTES } from "@/lib/routes";

// Only decides signed-in vs signed-out; /app then picks the landing for the role.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? ROUTES.appRoot : ROUTES.signIn);
}
