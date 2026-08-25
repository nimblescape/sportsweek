/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  handleServiceFailure,
  parseJsonBody,
  requireTeacherOrResponse,
} from "@/lib/api/handler";
import { ErrorCode } from "@/lib/errors";
import { documentIdSchema } from "@/lib/schemas/common";
import { namedListItemSchema } from "@/lib/schemas/master-data";
import { categoryOf, masterDataCategorySchema } from "@/lib/master-data/categories";
import { createMasterDataItem } from "@/lib/master-data/master-data-service";
import { blockedItemIds } from "@/lib/master-data/usage-guard";

const createItemSchema = z.strictObject({
  name: namedListItemSchema.shape.name,
  parentId: documentIdSchema.optional(),
});

type Context = { params: Promise<{ category: string }> };

/** The segment is untrusted input, so it is validated before it is allowed to name a collection. */
async function readCategory({ params }: Context) {
  const { category } = await params;
  return masterDataCategorySchema.safeParse(category);
}

export async function POST(request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const category = await readCategory(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  const body = await parseJsonBody(request, createItemSchema);
  if (!body.ok) return body.response;

  try {
    const item = await createMasterDataItem(category.data, body.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, `Creating a ${category.data} item`);
  }
}

/**
 * Which items the in-use guard currently blocks (US-5 to US-10). It is derived from student
 * master data, which clients may not read at all (see firestore.rules), so the list cannot work
 * this out for itself — and a teacher is the only role that ever sees these views.
 */
export async function GET(_request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const category = await readCategory(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  try {
    const blockedIds = await blockedItemIds(categoryOf(category.data));
    return NextResponse.json({ blockedIds });
  } catch (error) {
    return handleServiceFailure(error, `Reading ${category.data} usage`);
  }
}
