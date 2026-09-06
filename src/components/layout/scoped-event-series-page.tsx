/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { isEventSeriesReachable } from "@/lib/event-series/event-series-service";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import type { Uid } from "@/lib/schemas/common";

/**
 * Wraps one of the three scoped pages, refusing a series the header's tag row would not have
 * offered either (US-42) — reached by a URL typed by hand rather than a press on the row. The
 * refusal reads as the same sentence an already-unavailable series gives, so a scoped-out series
 * is not told apart from one that was deleted out from under the teacher.
 */
export async function ScopedEventSeriesPage({
  eventSeriesId,
  teacherUid,
  children,
}: {
  eventSeriesId: string;
  teacherUid: Uid;
  children: ReactNode;
}) {
  const reachable = await isEventSeriesReachable(eventSeriesId, teacherUid);

  return reachable ? (
    children
  ) : (
    <p role="status" className="text-muted-foreground text-sm">
      {NO_EVENT_SERIES_HINT}
    </p>
  );
}
