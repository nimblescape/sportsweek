/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

/**
 * The event series a view acts on, named by the page it is on (US-20, Q8). The header decides
 * once, for every page, so no view chooses one and none can disagree with the server about which
 * it meant. A student's comes from their registration instead, and may be none at all (US-23).
 *
 * Null once the list has arrived means the id names nothing reachable — archived, deleted, or
 * never there — and every view says so for itself.
 *
 * Its own module rather than beside `useEventSeries`, because a test that mocks the subscription
 * cannot reach a caller sitting in the same file.
 */
export function useSelectedEventSeries(eventSeriesId: string | null): {
  eventSeries: EventSeries | null;
  loading: boolean;
  error: string | null;
} {
  const { eventSeries, loading, error } = useEventSeries();
  const selected = useMemo(
    () => eventSeries.find((one) => one.id === eventSeriesId) ?? null,
    [eventSeries, eventSeriesId],
  );

  return { eventSeries: selected, loading, error };
}
