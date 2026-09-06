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
  requirePermissionOrResponse,
} from "@/lib/api/handler";
import { setEveryClassOpen } from "@/lib/invitations/invitation-service";

const setOpenSchema = z.strictObject({ isOpenToStudents: z.boolean() });

type Context = { params: Promise<{ eventSeriesId: string }> };

/**
 * The header door's one action (US-44): every class of the series, at once. Distinct from the
 * per-class toggle under `master-data/classes/open`, which the next slice narrows this one down
 * to (US-39).
 */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requirePermissionOrResponse("editRegistrations");
  if (denied) return denied;

  const { eventSeriesId } = await params;

  const body = await parseJsonBody(request, setOpenSchema);
  if (!body.ok) return body.response;

  try {
    await setEveryClassOpen(eventSeriesId, body.data.isOpenToStudents);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Opening or closing eventSeries ${eventSeriesId}`);
  }
}
