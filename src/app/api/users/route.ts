/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleServiceFailure,
  parseJsonBody,
  requirePermissionIdentityOrResponse,
} from "@/lib/api/handler";
import { permissionsInputSchema } from "@/lib/auth/permissions";
import { documentIdSchema } from "@/lib/schemas/common";
import { grantPermissions } from "@/lib/users/user-service";

/**
 * Whose rights are being changed travels in the body, because a path segment is recorded in the
 * platform's log of every request and an address is nobody's to leave there (US-33).
 *
 * The account is named by its uid, which is what a record is keyed by (US-31). Not lower-cased:
 * a uid is case-sensitive, unlike the address it replaced.
 *
 * Strict, so a body naming who is doing the granting fails rather than being quietly dropped:
 * that comes from the session, and there is nothing here for a caller to point at somebody else.
 */
const grantSchema = z
  .object({ uid: documentIdSchema, permissions: permissionsInputSchema })
  .strict();

export async function PATCH(request: Request) {
  const admin = await requirePermissionIdentityOrResponse("editUsers");
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(request, grantSchema);
  if (!body.ok) return body.response;

  try {
    const permissions = await grantPermissions(body.data.uid, body.data.permissions, admin.userId);
    return NextResponse.json({ permissions });
  } catch (error) {
    return handleServiceFailure(error, "Granting permissions");
  }
}
