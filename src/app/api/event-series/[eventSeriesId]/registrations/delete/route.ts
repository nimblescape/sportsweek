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
import { deleteRegistration } from "@/lib/registration/registration-service";
import { documentIdSchema } from "@/lib/schemas/common";

type Context = { params: Promise<{ eventSeriesId: string }> };

/**
 * Which student travels in the body, because a path segment is recorded in the platform's log of
 * every request and an address is nobody's to leave there (US-33). Strict, so a body reaching for
 * the series it deletes from fails rather than being quietly dropped: the path decides that.
 */
const deleteSchema = z.object({ studentUid: documentIdSchema }).strict();

/**
 * Removes one registration (US-28). A teacher's doing and never a student's: a student who is
 * not coming answers "no" (US-11), and this endpoint is closed to them by the guard.
 *
 * A POST rather than a DELETE, because the subject is in the body and a DELETE body has no
 * agreed meaning.
 */
export async function POST(request: Request, { params }: Context) {
  const denied = await requirePermissionOrResponse("editRegistrations");
  if (denied) return denied;

  const body = await parseJsonBody(request, deleteSchema);
  if (!body.ok) return body.response;

  const { eventSeriesId } = await params;

  try {
    await deleteRegistration(eventSeriesId, body.data.studentUid);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Deleting a registration");
  }
}
