import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { eventSchema } from "@/lib/schemas/season";
import { createEvent } from "@/lib/events/event-service";

const createEventSchema = z.strictObject({
  seasonId: eventSchema.shape.seasonId,
  name: eventSchema.shape.name,
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
