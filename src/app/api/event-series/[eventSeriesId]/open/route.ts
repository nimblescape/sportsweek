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
import { setEveryClassOpen } from "@/lib/invitations/invitation-service";

const setOpenSchema = z.strictObject({ isOpenToStudents: z.boolean() });

type Context = { params: Promise<{ eventSeriesId: string }> };

/**
 * The header door's one action (US-44): every class **in scope** of the series, at once —
 * the classes the caller looks after, or all of them where they look after none. Distinct from
 * the per-class toggle under `master-data/classes/open`, which names one class rather than a set.
 */
export async function PATCH(request: Request, { params }: Context) {
  const identified = await requirePermissionIdentityOrResponse("editRegistrations");
  if (!identified.ok) return identified.response;

  const { eventSeriesId } = await params;

  const body = await parseJsonBody(request, setOpenSchema);
  if (!body.ok) return body.response;

  try {
    await setEveryClassOpen(eventSeriesId, body.data.isOpenToStudents, identified.userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Opening or closing eventSeries ${eventSeriesId}`);
  }
}
