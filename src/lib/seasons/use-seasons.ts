"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { seasonSchema, type Season } from "@/lib/schemas/season";

/** Real-time read straight from the client SDK, governed by Security Rules. */
export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const seasonsQuery = query(collection(db, COLLECTIONS.seasons), orderBy("name", "desc"));

    return onSnapshot(
      seasonsQuery,
      (snapshot) => {
        setSeasons(
          snapshot.docs.flatMap((document) => {
            const parsed = seasonSchema.safeParse({ id: document.id, ...document.data() });
            if (!parsed.success) {
              console.error(`Season ${document.id} does not match the schema`, parsed.error);
              return [];
            }
            return [parsed.data];
          }),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to read seasons:", err);
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  return { seasons, loading, error };
}
