/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { eventSchema } from "@/lib/schemas/season";
import { deleteEvent, updateEvent } from "@/lib/events/event-service";

// Strict on purpose: `seasonId` is absent, so an event can never be moved between seasons.
const updateEventSchema = z.strictObject({ name: eventSchema.shape.name });

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, updateEventSchema);
  if (!body.ok) return body.response;

  const { eventId } = await params;

  try {
    const event = await updateEvent(eventId, body.data);
    return NextResponse.json({ event });
  } catch (error) {
    return handleServiceFailure(error, `Updating event ${eventId}`);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { eventId } = await params;

  try {
    await deleteEvent(eventId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting event ${eventId}`);
  }
}
