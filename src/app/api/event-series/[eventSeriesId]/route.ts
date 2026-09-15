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
  requireSignInOrResponse,
} from "@/lib/api/handler";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import { deleteEventSeries, updateEventSeries } from "@/lib/event-series/event-series-service";

// Strict, so a typo or an injected field is reported rather than silently ignored.
const updateEventSeriesSchema = z
  .strictObject({
    name: eventSeriesSchema.shape.name.optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Es wurde nichts zum Ändern übergeben.");

type Update = z.infer<typeof updateEventSeriesSchema>;

type Context = { params: Promise<{ eventSeriesId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  // Only that somebody is signed in is checked here; every field this schema still knows belongs
  // to the master data permission, checked below once the body is parsed.
  const denied = await requireSignInOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, updateEventSeriesSchema);
  if (!body.ok) return body.response;

  const refused = await requirePermissionOrResponse("editMasterData");
  if (refused) return refused;

  const { eventSeriesId } = await params;

  try {
    const eventSeries = await updateEventSeries(eventSeriesId, body.data);
    return NextResponse.json({ eventSeries });
  } catch (error) {
    return handleServiceFailure(error, `Updating eventSeries ${eventSeriesId}`);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  const { eventSeriesId } = await params;

  try {
    await deleteEventSeries(eventSeriesId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting eventSeries ${eventSeriesId}`);
  }
}
