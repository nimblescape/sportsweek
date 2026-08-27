/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { byPosition } from "@/lib/schemas/position";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";

/** Real-time read straight from the client SDK, governed by Security Rules. */
export function useEventSeries() {
  const [eventSeries, setEventSeries] = useState<EventSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<EventSeries>({
        label: "eventSeries",
        // Sorted here rather than in the query: Firestore's orderBy silently omits documents
        // that lack the field, which would hide any event series stored before ordering existed.
        buildQuery: () => query(collection(db, COLLECTIONS.eventSeries)),
        parse: (id, data) => {
          const parsed = eventSeriesSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(`EventSeries ${id} does not match the schema`, parsed.error);
            return null;
          }
          return parsed.data;
        },
        onData: (items) => {
          setEventSeries([...items].sort(byPosition));
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [],
  );

  return { eventSeries, loading, error };
}
