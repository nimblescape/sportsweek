/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  handleServiceFailure,
  parseJsonBody,
  requirePermissionOrResponse,
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
  type MasterDataScope,
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

/**
 * What a route resolves before any handler below runs: which series, which list, and — for an
 * event's own page (US-33) — which event. `scope` is left undefined for the series' own route,
 * so its calls into the service stay exactly what they were before scope existed, rather than
 * naming a scope that only ever means "the series".
 */
export type MasterDataTarget = {
  eventSeriesId: string;
  category: string;
  scope: MasterDataScope | undefined;
};
type TargetOutcome = { ok: true; target: MasterDataTarget } | { ok: false; response: NextResponse };

/**
 * The four handlers one master-data list needs, generalized over how a route names its list — a
 * series' own, or one of its events' (US-33). `resolveTarget` is the only thing that differs
 * between the route files that use this; validation, the in-use guard and the response shape are
 * one implementation shared by both, rather than a second copy of this file per scope.
 */
export function masterDataRouteHandlers<Context>(
  resolveTarget: (context: Context, request: Request) => Promise<TargetOutcome>,
) {
  async function resolveCategory(context: Context, request: Request) {
    const resolved = await resolveTarget(context, request);
    if (!resolved.ok) return resolved;

    const category = masterDataCategorySchema.safeParse(resolved.target.category);
    if (!category.success) {
      return {
        ok: false as const,
        response: errorResponse(ErrorCode.ValidationError, "Diese Kategorie gibt es nicht."),
      };
    }
    return {
      ok: true as const,
      eventSeriesId: resolved.target.eventSeriesId,
      scope: resolved.target.scope,
      category: category.data,
    };
  }

  async function POST(request: Request, context: Context) {
    const denied = await requirePermissionOrResponse("editMasterData");
    if (denied) return denied;

    const resolved = await resolveCategory(context, request);
    if (!resolved.ok) return resolved.response;
    const { eventSeriesId, category, scope } = resolved;

    const body = await parseJsonBody(request, createItemSchema);
    if (!body.ok) return body.response;

    try {
      const item = await (scope === undefined
        ? createMasterDataItem(eventSeriesId, category, body.data)
        : createMasterDataItem(eventSeriesId, category, body.data, scope));
      return NextResponse.json({ item }, { status: 201 });
    } catch (error) {
      return handleServiceFailure(error, `Creating a ${category} item`);
    }
  }

  /**
   * Reordering is deliberately free of the in-use guard the item writes carry: moving an item
   * changes no stored name, so no registration can be affected (see Ordering).
   */
  async function PATCH(request: Request, context: Context) {
    const denied = await requirePermissionOrResponse("editMasterData");
    if (denied) return denied;

    const resolved = await resolveCategory(context, request);
    if (!resolved.ok) return resolved.response;
    const { eventSeriesId, category, scope } = resolved;

    const body = await parseJsonBody(request, patchSchema);
    if (!body.ok) return body.response;

    try {
      if ("order" in body.data) {
        await (scope === undefined
          ? reorderMasterDataItems(eventSeriesId, category, body.data.order)
          : reorderMasterDataItems(eventSeriesId, category, body.data.order, scope));
        return new NextResponse(null, { status: 204 });
      }

      const { item, ...update } = body.data;
      const updated = await (scope === undefined
        ? updateMasterDataItem(eventSeriesId, category, item, update)
        : updateMasterDataItem(eventSeriesId, category, item, update, scope));
      return NextResponse.json({ item: updated });
    } catch (error) {
      return handleServiceFailure(error, `Updating ${category}`);
    }
  }

  async function DELETE(request: Request, context: Context) {
    const denied = await requirePermissionOrResponse("editMasterData");
    if (denied) return denied;

    const resolved = await resolveCategory(context, request);
    if (!resolved.ok) return resolved.response;
    const { eventSeriesId, category, scope } = resolved;

    const body = await parseJsonBody(request, deleteItemSchema);
    if (!body.ok) return body.response;

    try {
      await (scope === undefined
        ? deleteMasterDataItem(eventSeriesId, category, body.data.item)
        : deleteMasterDataItem(eventSeriesId, category, body.data.item, scope));
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      return handleServiceFailure(error, `Deleting a ${category} item`);
    }
  }

  /**
   * Which items the in-use guard currently blocks (US-5 to US-10). It is derived from the
   * registrations of this event series, which clients may not read at all (see firestore.rules),
   * so the list cannot work this out for itself — and a teacher is the only role that sees it.
   */
  async function GET(request: Request, context: Context) {
    const denied = await requirePermissionOrResponse("editMasterData");
    if (denied) return denied;

    const resolved = await resolveCategory(context, request);
    if (!resolved.ok) return resolved.response;
    const { eventSeriesId, category, scope } = resolved;

    try {
      const { eventSeriesId: id, items } = await (scope === undefined
        ? readMasterDataItems(eventSeriesId, category)
        : readMasterDataItems(eventSeriesId, category, scope));
      return NextResponse.json(await usageReport(id, categoryOf(category), items));
    } catch (error) {
      return handleServiceFailure(error, `Reading ${category} usage`);
    }
  }

  return { POST, PATCH, DELETE, GET };
}
