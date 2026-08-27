/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { byPosition } from "@/lib/schemas/position";
import { eventSchema, type Event } from "@/lib/schemas/event-series";

/** Real-time read scoped to one event series, governed by Security Rules. */
export function useEvents(eventSeriesId: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<Event>({
        label: "events",
        // Sorted here rather than in the query: Firestore's orderBy silently omits documents
        // that lack the field, which would hide any event stored before ordering existed.
        buildQuery: () =>
          query(collection(db, COLLECTIONS.events), where("eventSeriesId", "==", eventSeriesId)),
        parse: (id, data) => {
          const parsed = eventSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(`Event ${id} does not match the schema`, parsed.error);
            return null;
          }
          return parsed.data;
        },
        onData: (items) => {
          setEvents([...items].sort(byPosition));
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [eventSeriesId],
  );

  return { events, loading, error };
}
