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
import { listItemNameSchema } from "@/lib/schemas/master-data";
import { setClassOpen } from "@/lib/invitations/invitation-service";

/**
 * The card's one toggle (US-43): distinct from the generic master-data PATCH, whose strict schema
 * knows only a name and a program's equipment, and from the invitations route, which hands out an
 * address rather than deciding who may use it.
 */
const setOpenSchema = z.strictObject({
  class: listItemNameSchema,
  isOpenToStudents: z.boolean(),
});

type Context = { params: Promise<{ eventSeriesId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const identified = await requirePermissionIdentityOrResponse("editRegistrations");
  if (!identified.ok) return identified.response;

  const { eventSeriesId } = await params;

  const body = await parseJsonBody(request, setOpenSchema);
  if (!body.ok) return body.response;

  try {
    const item = await setClassOpen(
      eventSeriesId,
      body.data.class,
      body.data.isOpenToStudents,
      identified.userId,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return handleServiceFailure(error, `Opening or closing ${body.data.class}`);
  }
}
