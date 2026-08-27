/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { Program } from "@/lib/schemas/master-data";
import { categoryOf, type MasterDataCategoryKey } from "./categories";

/**
 * Which event series the teacher views act on. Until the header selection arrives (US-20) there
 * is exactly one candidate — the active series — so no view chooses one and none can disagree
 * with the server about which it meant.
 *
 * One subscription to one document now carries every maintained list (US-21). That is also what
 * lets a view tell an empty list from one that has not arrived: there is a single `loading` for
 * all six, where six subscriptions each looked empty until they answered.
 */
export function useActiveEventSeries(): {
  eventSeries: EventSeries | null;
  loading: boolean;
  error: string | null;
} {
  const { eventSeries, loading, error } = useEventSeries();
  const active = useMemo(() => activeEventSeriesOf(eventSeries), [eventSeries]);

  return { eventSeries: active, loading, error };
}

/** The names on one list, in the teacher's order (US-5 to US-10). A name is an item's identity. */
export function useMasterData(key: MasterDataCategoryKey) {
  const { eventSeries, loading, error } = useActiveEventSeries();

  const items = useMemo(
    () =>
      (eventSeries?.[categoryOf(key).field] ?? []).map((entry) =>
        typeof entry === "string" ? entry : entry.name,
      ),
    [eventSeries, key],
  );

  return { items, loading, error };
}

/**
 * The programs, each with the equipment it requires (US-5). Separate from `useMasterData`
 * because that one reduces every category to a name, which drops the list — and the student's
 * rental checkboxes are exactly that list (US-11).
 */
export function usePrograms() {
  const { eventSeries, loading, error } = useActiveEventSeries();

  return { programs: eventSeries?.programs ?? [], loading, error };
}

/** One program with its equipment list (US-5), named rather than pointed at (US-21). */
export function useProgram(name: string): {
  program: Program | null;
  loading: boolean;
  error: string | null;
} {
  const { programs, loading, error } = usePrograms();

  const program = useMemo(
    () => programs.find((candidate) => candidate.name === name) ?? null,
    [programs, name],
  );

  return { program, loading, error };
}

export type UsageReport = {
  /** False only once the handler has answered; until then nothing may be edited or deleted. */
  loading: boolean;
  blockedNames: Set<string>;
  /** Per program name, the entries of its equipment list a student still rents, as stored. */
  blockedEquipment: Record<string, string[]>;
};

const CHECKING: UsageReport = { loading: true, blockedNames: new Set(), blockedEquipment: {} };
const NOTHING_BLOCKED: UsageReport = {
  loading: false,
  blockedNames: new Set(),
  blockedEquipment: {},
};

/**
 * What the in-use guard blocks (US-5 to US-10). The answer depends on the registrations of this
 * event series, which clients may not read at all, so it comes from a teacher-guarded handler
 * rather than a subscription. Fetching once is enough: it only moves when a student edits their
 * registration, which cannot happen from this view.
 */
export function useUsageReport(key: MasterDataCategoryKey): UsageReport {
  const [report, setReport] = useState<UsageReport>(CHECKING);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/master-data/${key}`);
        const body = response.ok ? await response.json() : null;
        if (!active) return;

        setReport({
          loading: false,
          blockedNames: new Set(Array.isArray(body?.blockedNames) ? body.blockedNames : []),
          blockedEquipment:
            body?.blockedEquipment && typeof body.blockedEquipment === "object"
              ? body.blockedEquipment
              : {},
        });
      } catch (error) {
        // A missing answer only costs the disabled state; the server re-checks on every write,
        // so staying locked would withhold the list over a question nobody can answer.
        console.error(`Failed to read ${key} usage:`, error);
        if (active) setReport(NOTHING_BLOCKED);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [key]);

  return report;
}
