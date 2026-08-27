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
  requireTeacherIdentityOrResponse,
  requireTeacherOrResponse,
} from "@/lib/api/handler";
import { orderSchema } from "@/lib/schemas/order";
import { savedReportInputSchema } from "@/lib/schemas/saved-report";
import { createSavedReport, reorderSavedReports } from "@/lib/report/saved-report-service";

const reorderSchema = z.strictObject({ order: orderSchema });

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

/** Reorders the tag row (see Ordering); it changes nothing a report holds, so it needs no guard. */
export async function PATCH(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, reorderSchema);
  if (!body.ok) return body.response;

  try {
    await reorderSavedReports(body.data.order);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, "Reordering saved reports");
  }
}
