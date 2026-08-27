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
import { savedReportSchema, type SavedReport } from "@/lib/schemas/saved-report";

const byName = new Intl.Collator("de-AT").compare;

/**
 * Every saved report, live. They are shared among all teachers (US-13), so there is nothing to
 * scope the query by — and one teacher's save shows up in another's tag row without either of
 * them reloading.
 *
 * Listed alphabetically: unlike the lists a teacher maintains (see Ordering), these are looked
 * up by the name they were given rather than read in an order somebody decided.
 */
export function useSavedReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<SavedReport>({
        label: COLLECTIONS.savedReports,
        buildQuery: () => query(collection(db, COLLECTIONS.savedReports)),
        parse: (id, data) => {
          const parsed = savedReportSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(
              `${COLLECTIONS.savedReports}/${id} does not match the schema`,
              parsed.error,
            );
            return null;
          }
          return parsed.data;
        },
        onData: (received) => {
          setReports([...received].sort((left, right) => byName(left.name, right.name)));
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [],
  );

  return { reports, loading, error };
}
