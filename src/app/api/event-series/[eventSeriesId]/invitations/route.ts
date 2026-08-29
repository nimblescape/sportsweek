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
import { createInvitation, invitationsOf } from "@/lib/invitations/invitation-service";
import { listItemNameSchema } from "@/lib/schemas/master-data";

const createInvitationSchema = z.strictObject({ class: listItemNameSchema });

type Context = { params: Promise<{ eventSeriesId: string }> };

/**
 * The links this series already has, so the overview can offer a class the one it was given
 * rather than mint another (US-29). Teacher-only, and unreachable through the access rules — a
 * rule grants a whole document to everyone it grants it to, and a token is the enrolment itself.
 */
export async function GET(_request: Request, context: Context) {
  const denied = await requirePermissionOrResponse("editAssignments");
  if (denied) return denied;

  const { eventSeriesId } = await context.params;

  try {
    return NextResponse.json({ invitations: await invitationsOf(eventSeriesId) });
  } catch (error) {
    return handleServiceFailure(error, `Reading the invitations of ${eventSeriesId}`);
  }
}

/**
 * Hands out a class's invitation link, and opens the series to students by doing so (US-19,
 * US-23). Regenerating is the same call: it replaces that class's token and leaves every other
 * class alone.
 *
 * The token is answered once, here, and never read back: a client that loses it asks for a new
 * one. Nothing may read the collection it lives in (see firestore.rules), because a secret that
 * a rule would hand to everyone the document is readable by is not a secret.
 */
export async function POST(request: Request, context: Context) {
  const denied = await requirePermissionOrResponse("editAssignments");
  if (denied) return denied;

  const { eventSeriesId } = await context.params;
  const body = await parseJsonBody(request, createInvitationSchema);
  if (!body.ok) return body.response;

  try {
    const invitation = await createInvitation(eventSeriesId, body.data.class);
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, `Inviting ${body.data.class}`);
  }
}
