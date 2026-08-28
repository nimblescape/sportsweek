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
import { listItemNameSchema, requiredEquipmentSchema } from "@/lib/schemas/master-data";
import { categoryOf, masterDataCategorySchema } from "@/lib/master-data/categories";
import {
  createMasterDataItem,
  deleteMasterDataItem,
  readMasterDataItems,
  reorderMasterDataItems,
  updateMasterDataItem,
} from "@/lib/master-data/master-data-service";
import { usageReport } from "@/lib/master-data/usage-guard";

const createItemSchema = z.strictObject({
  name: listItemNameSchema,
  requiredEquipment: requiredEquipmentSchema.optional(),
});

/**
 * An item is named rather than pointed at, because its name is its identity (US-21). It travels
 * in the body rather than in the path: a name may contain a slash, which a path segment cannot.
 */
const itemSchema = listItemNameSchema;

const reorderSchema = z.strictObject({ order: z.array(listItemNameSchema) });

const editItemSchema = z
  .strictObject({
    item: itemSchema,
    name: listItemNameSchema.optional(),
    requiredEquipment: requiredEquipmentSchema.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.requiredEquipment !== undefined,
    "Es wurde keine Änderung angegeben.",
  );

/** One PATCH, two intents: reorder the whole list, or change one of its items. */
const patchSchema = z.union([reorderSchema, editItemSchema]);

const deleteItemSchema = z.strictObject({ item: itemSchema });

type Context = { params: Promise<{ category: string }> };

/** The segment is untrusted input, so it is validated before it is allowed to name a list. */
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
 * Reordering is deliberately free of the in-use guard the item writes carry: moving an item
 * changes no stored name, so no registration can be affected (see Ordering).
 */
export async function PATCH(request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const category = await readCategory(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  const body = await parseJsonBody(request, patchSchema);
  if (!body.ok) return body.response;

  try {
    if ("order" in body.data) {
      await reorderMasterDataItems(category.data, body.data.order);
      return new NextResponse(null, { status: 204 });
    }

    const { item, ...update } = body.data;
    return NextResponse.json({ item: await updateMasterDataItem(category.data, item, update) });
  } catch (error) {
    return handleServiceFailure(error, `Updating ${category.data}`);
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const category = await readCategory(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  const body = await parseJsonBody(request, deleteItemSchema);
  if (!body.ok) return body.response;

  try {
    await deleteMasterDataItem(category.data, body.data.item);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting a ${category.data} item`);
  }
}

/**
 * Which items the in-use guard currently blocks (US-5 to US-10). It is derived from the
 * registrations of this event series, which clients may not read at all (see firestore.rules),
 * so the list cannot work this out for itself — and a teacher is the only role that sees it.
 */
export async function GET(_request: Request, context: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const category = await readCategory(context);
  if (!category.success) {
    return errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht.");
  }

  try {
    const { eventSeriesId, items } = await readMasterDataItems(category.data);
    return NextResponse.json(await usageReport(eventSeriesId, categoryOf(category.data), items));
  } catch (error) {
    return handleServiceFailure(error, `Reading ${category.data} usage`);
  }
}
