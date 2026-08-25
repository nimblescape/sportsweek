/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { seasonSchema, type Season } from "@/lib/schemas/season";

/** Real-time read straight from the client SDK, governed by Security Rules. */
export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<Season>({
        label: "seasons",
        buildQuery: () => query(collection(db, COLLECTIONS.seasons), orderBy("name", "desc")),
        parse: (id, data) => {
          const parsed = seasonSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(`Season ${id} does not match the schema`, parsed.error);
            return null;
          }
          return parsed.data;
        },
        onData: (items) => {
          setSeasons(items);
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [],
  );

  return { seasons, loading, error };
}
