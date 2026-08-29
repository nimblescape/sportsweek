/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query } from "firebase/firestore";
import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import type { EventSeriesListField } from "@/lib/master-data/categories";
import { byPosition } from "@/lib/schemas/position";
import { prunedSelection, sameSelection, savedReportPath } from "@/lib/report/saved-reports";
import type { EventSeries } from "@/lib/schemas/event-series";
import { savedReportSchema, type SavedReport } from "@/lib/schemas/saved-report";

type Lists = Pick<EventSeries, EventSeriesListField>;

/**
 * One event series' saved reports, live. They are shared among all teachers (US-13), so one
 * teacher's save shows up in another's tag row without either of them reloading — but only in
 * the series it was saved in, whose lists it filters on.
 *
 * Each is pruned to what that series still asks for (US-21), and a report that had to be pruned
 * is written back so that it is stored as it is shown. A list emptied since a report was saved
 * leaves it holding a tag nothing can show and a field that would print "keine Angabe" for every
 * student; repairing it here rather than by cascading from the master data keeps a list edit one
 * write, and repairing it rather than only hiding it keeps the store honest.
 *
 * In the order the tags were dragged into (see Ordering): a teacher puts the reports they open
 * every week at the front, which no alphabet would have guessed.
 */
export function useSavedReports(eventSeriesId: string, eventSeries: Lists | null) {
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

  const pruned = useMemo(
    () =>
      eventSeries === null ? reports : reports.map((one) => prunedSelection(one, eventSeries)),
    [reports, eventSeries],
  );

  useRepair(eventSeriesId, reports, pruned);

  return { reports: pruned, loading, error };
}

/**
 * Writes back what pruning changed. Through the handler, because the declarative write path is
 * closed to a browser (see firestore.rules) — and once, because the repaired report comes back
 * through the subscription equal to its own pruned form, which is what ends the round.
 *
 * Every teacher looking at the same series will try it. The write is the same write, so the last
 * one wins with the value all of them computed; the attempted ids are remembered only to keep
 * one tab from sending it twice while the first is still out.
 */
function useRepair(
  eventSeriesId: string,
  stored: readonly SavedReport[],
  pruned: readonly SavedReport[],
) {
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    attempted.current = new Set();
  }, [eventSeriesId]);

  useEffect(() => {
    for (const [index, report] of pruned.entries()) {
      const before = stored[index];
      if (before === undefined || sameSelection(before, report)) continue;
      if (attempted.current.has(report.id)) continue;

      attempted.current.add(report.id);
      const url = `/api/event-series/${encodeURIComponent(eventSeriesId)}/saved-reports/${encodeURIComponent(report.id)}`;
      void apiRequest(url, {
        method: "PATCH",
        body: { name: report.name, filter: report.filter, fields: report.fields },
      }).catch((caught: unknown) => {
        // A repair nobody asked for says nothing when it fails: the report still reads correctly,
        // it is only still stored wrong, and the next reader will try again.
        console.error(`Repairing saved report ${report.id} failed`, caught);
        attempted.current.delete(report.id);
      });
    }
  }, [eventSeriesId, stored, pruned]);
}
