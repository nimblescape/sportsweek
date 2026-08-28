/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, parseJsonBody, requireStudentOrResponse } from "@/lib/api/handler";
import { registrationInputSchema } from "@/lib/schemas/registration";
import { saveRegistration } from "@/lib/registration/registration-service";
import { invitationTokenFromCookie } from "@/lib/invitations/invitation-cookie";
import { invitedClassFor } from "@/lib/invitations/invitation-service";

/**
 * The student's own registration in one event series (US-11).
 *
 * The series is in the path because a student may hold registrations in several (Q7), so which
 * form they are looking at is theirs to say. Whose record it is, is not: that follows from the
 * session, so there is nothing for a caller to point at somebody else's. Naming a series they
 * were never invited to gets them no further, since the class comes from the link rather than
 * from the body and a save with no class to give is refused.
 *
 * The whole record is sent every time, which is what makes the answer to "no" and the values
 * kept behind it a single, atomic state rather than a sequence of patches.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ eventSeriesId: string }> },
) {
  const student = await requireStudentOrResponse();
  if (!student.ok) return student.response;

  const body = await parseJsonBody(request, registrationInputSchema);
  if (!body.ok) return body.response;

  const { eventSeriesId } = await context.params;

  try {
    const invitedClass = await invitedClassFor(eventSeriesId, await invitationTokenFromCookie());
    const record = await saveRegistration(
      { studentUpn: student.userId, eventSeriesId, invitedClass },
      body.data,
    );
    return NextResponse.json({ record });
  } catch (error) {
    return handleServiceFailure(error, "Saving registration");
  }
}
