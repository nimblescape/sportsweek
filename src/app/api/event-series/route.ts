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
import { orderSchema } from "@/lib/schemas/order";
import { documentIdSchema } from "@/lib/schemas/common";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import { createEventSeries, reorderEventSeries } from "@/lib/event-series/event-series-service";

/**
 * Two answers, one write (US-22): what it is called, and which existing event series its lists
 * come from. There is no separate duplicate action, so this is the only way one comes into being.
 */
const createEventSeriesSchema = z.strictObject({
  name: eventSeriesSchema.shape.name,
  sourceId: documentIdSchema.nullable().default(null),
});

const reorderSchema = z.strictObject({ order: orderSchema });

export async function POST(request: Request) {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  const body = await parseJsonBody(request, createEventSeriesSchema);
  if (!body.ok) return body.response;

  try {
    const eventSeries = await createEventSeries(body.data);
    return NextResponse.json({ eventSeries }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Creating an event series");
  }
}

/** Reorders the event series list (see Ordering); it changes no name or flag, so it needs no guard. */
export async function PATCH(request: Request) {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  const body = await parseJsonBody(request, reorderSchema);
  if (!body.ok) return body.response;

  try {
    await reorderEventSeries(body.data.order);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Reordering event series");
  }
}
