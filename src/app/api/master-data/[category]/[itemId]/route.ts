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
import { namedListItemSchema } from "@/lib/schemas/master-data";
import { masterDataCategorySchema } from "@/lib/master-data/categories";
import { deleteMasterDataItem, updateMasterDataItem } from "@/lib/master-data/master-data-service";

// Strict, so a typo or an injected field is reported rather than silently ignored. An item
// never moves between parents, which is why parentId is not accepted here.
const updateItemSchema = z.strictObject({ name: namedListItemSchema.shape.name });

type Context = { params: Promise<{ category: string; itemId: string }> };

async function readParams({ params }: Context) {
  const { category, itemId } = await params;
  return { category: masterDataCategorySchema.safeParse(category), itemId };
}

export async function PATCH(request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { category, itemId } = await readParams(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  const body = await parseJsonBody(request, updateItemSchema);
  if (!body.ok) return body.response;

  try {
    const item = await updateMasterDataItem(category.data, itemId, body.data);
    return NextResponse.json({ item });
  } catch (error) {
    return handleServiceFailure(error, `Updating ${category.data} item ${itemId}`);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { category, itemId } = await readParams(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  try {
    await deleteMasterDataItem(category.data, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting ${category.data} item ${itemId}`);
  }
}
