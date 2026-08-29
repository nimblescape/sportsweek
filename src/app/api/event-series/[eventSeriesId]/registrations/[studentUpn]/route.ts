/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, requirePermissionOrResponse } from "@/lib/api/handler";
import { deleteRegistration } from "@/lib/registration/registration-service";

type Context = { params: Promise<{ eventSeriesId: string; studentUpn: string }> };

/**
 * Removes one registration (US-28). A teacher's doing and never a student's: a student who is
 * not coming answers "no" (US-11), and this endpoint is closed to them by the guard.
 */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requirePermissionOrResponse("editRegistrations");
  if (denied) return denied;

  const { eventSeriesId, studentUpn } = await params;

  try {
    await deleteRegistration(eventSeriesId, decodeURIComponent(studentUpn));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting registration ${studentUpn}`);
  }
}
