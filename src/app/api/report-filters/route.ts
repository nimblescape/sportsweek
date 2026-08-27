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
import { savedReportFilterInputSchema } from "@/lib/schemas/saved-report-filter";
import { createSavedFilter } from "@/lib/report/saved-filter-service";

export async function POST(request: Request) {
  const teacher = await requireTeacherIdentityOrResponse();
  if (!teacher.ok) return teacher.response;

  const body = await parseJsonBody(request, savedReportFilterInputSchema);
  if (!body.ok) return body.response;

  try {
    const filter = await createSavedFilter(body.data, teacher.userId);
    return NextResponse.json({ filter }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Saving a report filter");
  }
}
