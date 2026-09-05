/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { masterDataRouteHandlers } from "@/lib/master-data/route-handlers";

type Context = { params: Promise<{ eventSeriesId: string; category: string }> };

export const { POST, PATCH, DELETE, GET } = masterDataRouteHandlers<Context>(async ({ params }) => {
  const { eventSeriesId, category } = await params;
  return { ok: true, target: { eventSeriesId, category, scope: undefined } };
});
