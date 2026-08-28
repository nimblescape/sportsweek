/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { EventSeries } from "@/lib/schemas/event-series";

export const EVENT_SERIES_STATES = ["archived", "template", "open", "closed"] as const;
export type EventSeriesState = (typeof EVENT_SERIES_STATES)[number];

/**
 * Shown by every teacher view whose selection resolves to nothing (US-19, US-20) — a series
 * archived or deleted by somebody else while it was open, an address that never named one, or no
 * series at all. One sentence for all of them, because the way out is the same: pick another
 * from the header, or make one on the list the header is fed from.
 */
export const NO_EVENT_SERIES_HINT =
  "Diese Eventreihe steht nicht zur Verfügung. " +
  "Bitte wähle oben eine andere aus oder lege in der Eventreihenliste eine neue an.";

/** Why an archived event series refuses a rename, said once for the guard and whoever shows it. */
export const ARCHIVED_IS_READ_ONLY_HINT =
  "Eine archivierte Eventreihe kann nicht bearbeitet werden. Bitte zuerst aus dem Archiv holen.";

/**
 * What the list says about a series (US-19) — derived from the stored flags, never persisted.
 *
 * The order is a precedence rather than a preference: archiving closes a series and takes away
 * every screen that could show it, and a template can never be opened to students at all — so a
 * record that somehow contradicts itself still resolves to exactly one state.
 */
export function eventSeriesState(
  eventSeries: Pick<EventSeries, "isArchived" | "isTemplate" | "isOpenToStudents">,
): EventSeriesState {
  if (eventSeries.isArchived) return "archived";
  if (eventSeries.isTemplate) return "template";
  return eventSeries.isOpenToStudents ? "open" : "closed";
}

export const EVENT_SERIES_STATE_LABELS: Record<EventSeriesState, string> = {
  archived: "Archiviert",
  template: "Vorlage",
  open: "Anmeldung freigeschaltet",
  closed: "Anmeldung nicht freigeschaltet",
};

/** Archived event series are hidden by default; the list offers a toggle to bring them back (US-19). */
export function visibleEventSeries<T extends Pick<EventSeries, "isArchived">>(
  allEventSeries: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? allEventSeries : allEventSeries.filter((one) => !one.isArchived);
}
