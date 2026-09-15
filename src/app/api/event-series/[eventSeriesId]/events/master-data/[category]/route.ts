/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { errorResponse } from "@/lib/api/handler";
import { ErrorCode } from "@/lib/errors";
import { masterDataRouteHandlers } from "@/lib/master-data/route-handlers";
import { listItemNameSchema } from "@/lib/schemas/master-data";

type Context = { params: Promise<{ eventSeriesId: string; category: string }> };

/**
 * One event's own page (US-33). The event is named in a search parameter rather than a segment,
 * since a teacher typed it and it may hold a slash a path segment cannot carry (see hierarchy.ts
 * for why). Which categories an event may actually override is the service's own rule, checked
 * once there and not repeated here.
 */
export const { POST, PATCH, DELETE, GET } = masterDataRouteHandlers<Context>(
  async ({ params }, request) => {
    const { eventSeriesId, category } = await params;
    const event = listItemNameSchema.safeParse(new URL(request.url).searchParams.get("event"));
    if (!event.success) {
      return {
        ok: false,
        response: errorResponse(ErrorCode.ValidationError, "Es wurde kein Event angegeben."),
      };
    }

    return {
      ok: true,
      target: { eventSeriesId, category, scope: { kind: "event", name: event.data } },
    };
  },
);
