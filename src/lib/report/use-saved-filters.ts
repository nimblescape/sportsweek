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
import { savedReportFilterSchema, type SavedReportFilter } from "@/lib/schemas/saved-report-filter";

const byName = new Intl.Collator("de-AT").compare;

/**
 * Every saved filter, live. They are shared among all teachers (US-13), so there is nothing to
 * scope the query by — and a filter one teacher saves shows up in another's dropdown without
 * either of them reloading.
 *
 * Listed alphabetically: unlike the lists a teacher maintains (see Ordering), these are looked
 * up by the name they were given rather than read in an order somebody decided.
 */
export function useSavedFilters() {
  const [filters, setFilters] = useState<SavedReportFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<SavedReportFilter>({
        label: COLLECTIONS.savedReportFilters,
        buildQuery: () => query(collection(db, COLLECTIONS.savedReportFilters)),
        parse: (id, data) => {
          const parsed = savedReportFilterSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(
              `${COLLECTIONS.savedReportFilters}/${id} does not match the schema`,
              parsed.error,
            );
            return null;
          }
          return parsed.data;
        },
        onData: (received) => {
          setFilters([...received].sort((left, right) => byName(left.name, right.name)));
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [],
  );

  return { filters, loading, error };
}
