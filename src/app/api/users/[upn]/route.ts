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
import { grantPermissions } from "@/lib/users/user-service";

type Context = { params: Promise<{ upn: string }> };

/**
 * Strict, so a body naming who is doing the granting fails rather than being quietly dropped:
 * that comes from the session, and there is nothing here for a caller to point at somebody else.
 */
const grantSchema = z.object({ permissions: permissionsInputSchema }).strict();

export async function PATCH(request: Request, context: Context) {
  const admin = await requirePermissionIdentityOrResponse("editUsers");
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(request, grantSchema);
  if (!body.ok) return body.response;

  const { upn } = await context.params;

  try {
    const permissions = await grantPermissions(
      decodeURIComponent(upn).toLowerCase(),
      body.data.permissions,
      admin.userId,
    );
    return NextResponse.json({ permissions });
  } catch (error) {
    return handleServiceFailure(error, "Granting permissions");
  }
}
