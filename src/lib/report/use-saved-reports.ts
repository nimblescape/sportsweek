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
import { byPosition } from "@/lib/schemas/position";
import { savedReportPath } from "@/lib/report/saved-reports";
import { savedReportSchema, type SavedReport } from "@/lib/schemas/saved-report";

/**
 * One event series' saved reports, live. They are shared among all teachers (US-13), so one
 * teacher's save shows up in another's tag row without either of them reloading — but only in
 * the series it was saved in, whose lists it filters on.
 *
 * In the order the tags were dragged into (see Ordering): a teacher puts the reports they open
 * every week at the front, which no alphabet would have guessed.
 */
export function useSavedReports(eventSeriesId: string) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = savedReportPath(eventSeriesId);

    return subscribeWithRecovery<SavedReport>({
      label: path,
      buildQuery: () => query(collection(db, path)),
      parse: (id, data) => {
        const parsed = savedReportSchema.safeParse({ id, ...data });
        if (!parsed.success) {
          console.error(`${path}/${id} does not match the schema`, parsed.error);
          return null;
        }
        return parsed.data;
      },
      onData: (received) => {
        setReports([...received].sort(byPosition));
        setLoading(false);
      },
      onError: (message) => {
        setError(message);
        if (message !== null) setLoading(false);
      },
    });
  }, [eventSeriesId]);

  return { reports, loading, error };
}
