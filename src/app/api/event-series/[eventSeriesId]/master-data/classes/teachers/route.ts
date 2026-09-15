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
import { listItemNameSchema } from "@/lib/schemas/master-data";
import { uidSchema } from "@/lib/schemas/common";
import { setClassTeachers } from "@/lib/master-data/master-data-service";

/**
 * Distinct from the generic master-data PATCH (`master-data/[category]`), whose strict schema
 * knows only a name and a program's equipment: a body naming `teacherUids` there would be a field
 * that handler never learned to guard. The class-teachers editor writes `teacherUids` and nothing
 * else (class-teachers spec), so it gets a route of its own.
 */
const setTeachersSchema = z.strictObject({
  class: listItemNameSchema,
  teacherUids: z.array(uidSchema),
});

type Context = { params: Promise<{ eventSeriesId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  const { eventSeriesId } = await params;

  const body = await parseJsonBody(request, setTeachersSchema);
  if (!body.ok) return body.response;

  try {
    const item = await setClassTeachers(eventSeriesId, body.data.class, body.data.teacherUids);
    return NextResponse.json({ item });
  } catch (error) {
    return handleServiceFailure(error, "Assigning class teachers");
  }
}
