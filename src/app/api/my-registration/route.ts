/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, parseJsonBody, requireStudentOrResponse } from "@/lib/api/handler";
import { registrationInputSchema } from "@/lib/schemas/registration";
import { saveRegistration } from "@/lib/registration/registration-service";

/**
 * The student's own registration for the active event series (US-11). One endpoint, no id in the
 * path: whose record this is follows from the session, so there is nothing for a caller to
 * point somewhere else. The whole record is sent every time, which is what makes the answer to
 * "no" and the values kept behind it a single, atomic state rather than a sequence of patches.
 */
export async function PUT(request: Request) {
  const student = await requireStudentOrResponse();
  if (!student.ok) return student.response;

  const body = await parseJsonBody(request, registrationInputSchema);
  if (!body.ok) return body.response;

  try {
    const record = await saveRegistration(student.userId, body.data);
    return NextResponse.json({ record });
  } catch (error) {
    return handleServiceFailure(error, "Saving registration");
  }
}
