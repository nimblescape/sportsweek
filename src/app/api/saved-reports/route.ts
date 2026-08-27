/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import {
  handleServiceFailure,
  parseJsonBody,
  requireTeacherIdentityOrResponse,
} from "@/lib/api/handler";
import { savedReportInputSchema } from "@/lib/schemas/saved-report";
import { createSavedReport } from "@/lib/report/saved-report-service";

export async function POST(request: Request) {
  const teacher = await requireTeacherIdentityOrResponse();
  if (!teacher.ok) return teacher.response;

  const body = await parseJsonBody(request, savedReportInputSchema);
  if (!body.ok) return body.response;

  try {
    const report = await createSavedReport(body.data, teacher.userId);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Saving a report");
  }
}
