/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { savedReportFilterRenameSchema } from "@/lib/schemas/saved-report-filter";
import { deleteSavedFilter, renameSavedFilter } from "@/lib/report/saved-filter-service";

type Context = { params: Promise<{ filterId: string }> };

/** Renaming only: the selection a filter holds is replaced by saving a new one, not edited. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, savedReportFilterRenameSchema);
  if (!body.ok) return body.response;

  const { filterId } = await params;

  try {
    const filter = await renameSavedFilter(filterId, body.data.name);
    return NextResponse.json({ filter });
  } catch (error) {
    return handleServiceFailure(error, `Renaming report filter ${filterId}`);
  }
}

/** Shared among all teachers, so any of them may remove one — including one they did not save. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { filterId } = await params;

  try {
    await deleteSavedFilter(filterId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting report filter ${filterId}`);
  }
}
