/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { EventSeries } from "@/lib/schemas/event-series";

export const EVENT_SERIES_STATES = ["active", "archived", "inactive"] as const;
export type EventSeriesState = (typeof EVENT_SERIES_STATES)[number];

/** Shown by the views that bind to the active event series, and returned by the handlers behind them. */
export const NO_ACTIVE_EVENT_SERIES_HINT = "Es ist keine Eventreihe aktiv.";

/** Why an archived event series refuses a rename, said once for the guard and whoever shows it. */
export const ARCHIVED_IS_READ_ONLY_HINT =
  "Eine archivierte Eventreihe kann nicht bearbeitet werden. Bitte zuerst aus dem Archiv holen.";

/**
 * Derives the displayed state from the two stored flags (US-4) — it is never persisted.
 * Archived takes precedence, so a contradictory record still resolves to exactly one state.
 */
export function eventSeriesState(
  eventSeries: Pick<EventSeries, "isActive" | "isArchived">,
): EventSeriesState {
  if (eventSeries.isArchived) return "archived";
  if (eventSeries.isActive) return "active";
  return "inactive";
}

export const EVENT_SERIES_STATE_LABELS: Record<EventSeriesState, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  inactive: "Inaktiv",
};

/** Archived event series are hidden by default; the list offers a toggle to bring them back (US-4). */
export function visibleEventSeries<T extends Pick<EventSeries, "isArchived">>(
  allEventSeries: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? allEventSeries : allEventSeries.filter((one) => !one.isArchived);
}

/**
 * A registration carries no archived flag of its own — its state is derived from the
 * event series it belongs to (US-4, US-11), so archiving an event series locks its records in one write.
 */
export function isRecordArchived(
  record: { eventSeriesId: string },
  allEventSeries: Pick<EventSeries, "id" | "isArchived">[],
): boolean {
  const eventSeries = allEventSeries.find((candidate) => candidate.id === record.eventSeriesId);
  return eventSeries?.isArchived ?? false;
}

/**
 * Registration, the assignment dialog and the report all bind to the active event series.
 * Having none is a legitimate state a teacher creates by deactivating (US-4) — callers then
 * lock their view instead — whereas an ambiguous result is a data defect and must surface loudly.
 */
export function activeEventSeriesOf<T extends Pick<EventSeries, "isActive">>(
  allEventSeries: T[],
): T | null {
  const active = allEventSeries.filter((one) => one.isActive);

  if (active.length > 1) {
    throw new Error(`Es sind ${active.length} Eventreihen aktiv, es darf aber nur eine geben.`);
  }

  return active[0] ?? null;
}
