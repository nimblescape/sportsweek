/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { assignStudents } from "@/lib/assignment/assignment-service";
import { MAX_WRITES_PER_BATCH } from "@/lib/firebase/batch";
import { documentIdSchema } from "@/lib/schemas/common";
import { registrationSchema } from "@/lib/schemas/registration";

/**
 * One call moves the teacher's whole selection (US-12), so the ids are a list. Bounded because
 * an unbounded one is unbounded work; a move is a class or two, never more than a single commit.
 */
const assignSchema = z.strictObject({
  recordIds: z
    .array(documentIdSchema)
    .min(1, "Es ist niemand ausgewählt.")
    .max(MAX_WRITES_PER_BATCH, `Höchstens ${MAX_WRITES_PER_BATCH} Anmeldungen auf einmal.`),
  // Null unassigns: moving between events is unassign, then assign, and nothing else (US-12).
  eventId: registrationSchema.shape.eventId,
});

export async function PATCH(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, assignSchema);
  if (!body.ok) return body.response;

  try {
    await assignStudents(body.data.recordIds, body.data.eventId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Assigning students to an event");
  }
}
