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
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import type { Permission } from "@/lib/auth/permissions";
import { deleteEventSeries, updateEventSeries } from "@/lib/event-series/event-series-service";

// Strict, so a typo or an injected field is reported rather than silently ignored.
const updateEventSeriesSchema = z
  .strictObject({
    name: eventSeriesSchema.shape.name.optional(),
    isArchived: z.boolean().optional(),
    isOpenToStudents: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Es wurde nichts zum Ändern übergeben.");

type Update = z.infer<typeof updateEventSeriesSchema>;

/**
 * Whether registration is open belongs to the registrations page rather than to the series'
 * own record, so it is that permission which opens and closes it. Every other field stays with
 * the master data — and a body touching both needs both, so an opening cannot carry a rename.
 */
const OPENING: keyof Update = "isOpenToStudents";

function permissionsFor(update: Update): Permission[] {
  const fields = Object.keys(update) as (keyof Update)[];

  return [
    ...(fields.includes(OPENING) ? (["editRegistrations"] as const) : []),
    ...(fields.some((field) => field !== OPENING) ? (["editMasterData"] as const) : []),
  ];
}

type Context = { params: Promise<{ eventSeriesId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  // Read before the permission check, because which permission is needed depends on what changes.
  const body = await parseJsonBody(request, updateEventSeriesSchema);
  if (!body.ok) return body.response;

  for (const permission of permissionsFor(body.data)) {
    const denied = await requirePermissionOrResponse(permission);
    if (denied) return denied;
  }

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
