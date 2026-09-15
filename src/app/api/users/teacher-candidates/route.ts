/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, requirePermissionOrResponse } from "@/lib/api/handler";
import { listTeacherCandidates } from "@/lib/users/user-service";

/**
 * Every teacher a class assignment may name (US-38). `users` stays closed to `editMasterData` at
 * the rules layer (see firestore.rules), so the class-teachers editor has no declarative way to
 * read it and asks this route instead — the one place that re-verifies the permission server-side.
 */
export async function GET() {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  try {
    const candidates = await listTeacherCandidates();
    return NextResponse.json({ candidates });
  } catch (error) {
    return handleServiceFailure(error, "Reading teacher candidates");
  }
}
