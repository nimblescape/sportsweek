/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { documentIdSchema } from "@/lib/schemas/common";
import { listItemNameSchema } from "@/lib/schemas/master-data";
import { createEvent, deleteEvent, reorderEvents, updateEvent } from "@/lib/events/event-service";

/**
 * The event series is always named, because this page is reached through one and its id is the
 * one identifier the URL already carries (US-4). The event itself is named rather than pointed
 * at, since its name is its identity (US-21) — and it travels in the body rather than in the
 * path, because a name may contain a slash and a path segment may not.
 */
const createEventSchema = z.strictObject({
  eventSeriesId: documentIdSchema,
  name: listItemNameSchema,
});

const reorderSchema = z.strictObject({
  eventSeriesId: documentIdSchema,
  order: z.array(listItemNameSchema),
});

// Strict on purpose: the series is named but never changed, so an event cannot be moved out of it.
const renameSchema = z.strictObject({
  eventSeriesId: documentIdSchema,
  event: listItemNameSchema,
  name: listItemNameSchema,
});

/** One PATCH, two intents: reorder the whole list, or rename one of its events. */
const patchSchema = z.union([reorderSchema, renameSchema]);

const deleteEventSchema = z.strictObject({
  eventSeriesId: documentIdSchema,
  event: listItemNameSchema,
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

/** Reordering changes no name, so no registration can be affected by it (see Ordering). */
export async function PATCH(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, patchSchema);
  if (!body.ok) return body.response;

  try {
    if ("order" in body.data) {
      await reorderEvents(body.data.eventSeriesId, body.data.order);
      return new NextResponse(null, { status: 204 });
    }

    const { eventSeriesId, event, name } = body.data;
    return NextResponse.json({ event: await updateEvent(eventSeriesId, event, { name }) });
  } catch (error) {
    return handleServiceFailure(error, "Updating an event");
  }
}

export async function DELETE(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, deleteEventSchema);
  if (!body.ok) return body.response;

  try {
    await deleteEvent(body.data.eventSeriesId, body.data.event);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Deleting an event");
  }
}
