/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { eventSchema } from "@/lib/schemas/season";
import { orderSchema } from "@/lib/schemas/order";
import { createEvent, reorderEvents } from "@/lib/events/event-service";

const createEventSchema = z.strictObject({
  seasonId: eventSchema.shape.seasonId,
  name: eventSchema.shape.name,
});

// Scoped to a season, so reordering one season's events can never renumber another's.
const reorderSchema = z.strictObject({
  seasonId: eventSchema.shape.seasonId,
  order: orderSchema,
});

export async function POST(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, createEventSchema);
  if (!body.ok) return body.response;

  try {
    const event = await createEvent(body.data);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Creating an event");
  }
}

/** Reorders one season's events (see Ordering); it changes no name, so it needs no guard. */
export async function PATCH(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, reorderSchema);
  if (!body.ok) return body.response;

  try {
    await reorderEvents(body.data.seasonId, body.data.order);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Reordering events");
  }
}
