/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { normalizeName } from "@/lib/firebase/name-key";
import type { EventSeries } from "@/lib/schemas/event-series";
import {
  MASTER_DATA_CATEGORIES,
  PER_EVENT_CATEGORY_KEYS,
  type EventSeriesListField,
} from "./categories";

type Lists = Pick<EventSeries, EventSeriesListField>;

function named(entry: string | { name: string }): string {
  return typeof entry === "string" ? entry : entry.name;
}

/**
 * What one event of this series actually offers (US-33, US-35): its own entries for a category it
 * names any of, the series' otherwise. The one function every caller asks — the form, the
 * completeness check, the report, the filter and the server-side validation of a saved answer —
 * so none of them can come to resolve a student's event differently from another.
 */
export function resolveEventLists(eventSeries: Lists, eventName: string | null): Lists {
  const wanted = eventName === null ? null : normalizeName(eventName);
  const event = eventSeries.events.find((candidate) => normalizeName(candidate.name) === wanted);

  const overridden = Object.fromEntries(
    PER_EVENT_CATEGORY_KEYS.map((key) => {
      const field = MASTER_DATA_CATEGORIES[key].field;
      const own = event?.[field] ?? [];
      return [field, own.length > 0 ? own : eventSeries[field]];
    }),
  );

  return { ...eventSeries, ...overridden } as Lists;
}

/**
 * Every value a category could ever answer with in this series (US-33): the series' own entries,
 * widened by whatever any of its events name instead of them. Answers a question the per-event
 * resolution above cannot — not "what does this student's event offer" but "what could any
 * student's event offer" — which is what a report field or a filter category has to know before
 * it can decide whether to show itself at all, and a saved filter has to know before it can tell
 * a value still on offer from one that is not.
 */
export function seriesWideLists(eventSeries: Lists): Lists {
  const widened = Object.fromEntries(
    PER_EVENT_CATEGORY_KEYS.map((key) => {
      const field = MASTER_DATA_CATEGORIES[key].field;
      const seriesOwn = eventSeries[field] as readonly (string | { name: string })[];
      const fromEvents = eventSeries.events.flatMap(
        (event) => event[field] as readonly (string | { name: string })[],
      );
      const seen = new Set<string>();
      const combined = [...seriesOwn, ...fromEvents].filter((entry) => {
        const key = normalizeName(named(entry));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [field, combined];
    }),
  );

  return { ...eventSeries, ...widened } as Lists;
}
