/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { savedReportEditSchema } from "@/lib/schemas/saved-report";
import {
  deleteSavedReport,
  renameSavedReport,
  updateSavedReportSelection,
} from "@/lib/report/saved-report-service";

type Context = { params: Promise<{ reportId: string }> };

/** The two edits a tag offers: its name, or what it holds replaced by the report on screen. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, savedReportEditSchema);
  if (!body.ok) return body.response;

  const { reportId } = await params;

  try {
    const report =
      "name" in body.data
        ? await renameSavedReport(reportId, body.data.name)
        : await updateSavedReportSelection(reportId, body.data);
    return NextResponse.json({ report });
  } catch (error) {
    return handleServiceFailure(error, `Editing saved report ${reportId}`);
  }
}

/** Shared among all teachers, so any of them may remove one — including one they did not save. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { reportId } = await params;

  try {
    await deleteSavedReport(reportId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting saved report ${reportId}`);
  }
}
