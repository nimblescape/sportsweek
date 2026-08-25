"use client";

import { useEffect, useState } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSchema, type Event } from "@/lib/schemas/season";

/** Real-time read scoped to one season, governed by Security Rules. */
export function useEvents(seasonId: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<Event>({
        label: "events",
        buildQuery: () =>
          query(
            collection(db, COLLECTIONS.events),
            where("seasonId", "==", seasonId),
            orderBy("name"),
          ),
        parse: (id, data) => {
          const parsed = eventSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(`Event ${id} does not match the schema`, parsed.error);
            return null;
          }
          return parsed.data;
        },
        onData: (items) => {
          setEvents(items);
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [seasonId],
  );

  return { events, loading, error };
}
