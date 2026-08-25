"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSchema, type Event } from "@/lib/schemas/season";

/** Real-time read scoped to one season, governed by Security Rules. */
export function useEvents(seasonId: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventsQuery = query(
      collection(db, COLLECTIONS.events),
      where("seasonId", "==", seasonId),
      orderBy("name"),
    );

    return onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEvents(
          snapshot.docs.flatMap((document) => {
            const parsed = eventSchema.safeParse({ id: document.id, ...document.data() });
            if (!parsed.success) {
              console.error(`Event ${document.id} does not match the schema`, parsed.error);
              return [];
            }
            return [parsed.data];
          }),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to read events:", err);
        setError(err.message);
        setLoading(false);
      },
    );
  }, [seasonId]);

  return { events, loading, error };
}
