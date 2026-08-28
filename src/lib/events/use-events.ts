/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { useEventSeries } from "@/lib/event-series/use-event-series";

/**
 * The events of one event series, in the teacher's order (US-4). They are a field of that
 * series' document (US-21), so this derives from the subscription the views already hold rather
 * than running a live query of its own — which is also what lets a caller tell an empty list
 * from one that has not arrived yet, since both now share one loading flag.
 */
export function useEvents(eventSeriesId: string) {
  const { eventSeries, loading, error } = useEventSeries();

  const events = useMemo(
    () => eventSeries.find((candidate) => candidate.id === eventSeriesId)?.events ?? [],
    [eventSeries, eventSeriesId],
  );

  return { events, loading, error };
}
