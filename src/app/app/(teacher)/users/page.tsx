/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { requirePermission } from "@/lib/auth/guards";
import { UserPermissionsView } from "@/components/users/user-permissions-view";

/**
 * Who may do what (US-2). The signed-in admin is named so the row can say why their own right to
 * grant is not on offer — taking it from yourself is what would leave nobody able to give it back.
 * By uid, which is what a record is keyed by: an address would match nobody (US-31).
 */
export default async function UsersPage() {
  const admin = await requirePermission("editUsers");

  return <UserPermissionsView signedInUid={admin.uid} />;
}
