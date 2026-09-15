/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { normalizeName } from "@/lib/firebase/name-key";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { ClassOption } from "@/lib/schemas/master-data";

export const EVENT_SERIES_STATES = ["archived", "open", "closed"] as const;
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

/** Archiving signs a series off, and there is nothing to sign off on until somebody registers. */
export const ARCHIVE_NO_DATA_HINT =
  "Eine Eventreihe ohne Registrierungen kann nicht archiviert werden.";

/**
 * Closing is a decision a teacher makes on the tag of the series it concerns (US-19). Archiving
 * an open one would make that decision for them, and students holding the link would find it shut
 * without anyone having shut it.
 */
export const ARCHIVE_OPEN_HINT =
  "Eine offene Eventreihe kann nicht archiviert werden. Bitte zuerst für Schüler:innen schließen.";

/**
 * While a class is open a student may be answering the questions their event decides at the
 * moment a teacher moves them, and neither of them would ever know. Closing is the teacher's own
 * act, so the write is refused rather than the class closed on their behalf (US-43).
 */
export const ASSIGN_OPEN_HINT =
  "In einer offenen Klasse kann nicht zugeteilt werden. " +
  "Bitte zuerst für Schüler:innen schließen.";

/** What every write refuses with when the series it names has been deleted meanwhile. */
export const NO_SUCH_EVENT_SERIES = "Diese Eventreihe gibt es nicht.";

/**
 * Why the last one stays. Everything a teacher sees is scoped to a selection, so a school with no
 * event series at all has a header offering nothing and a navigation bar pointing nowhere. One
 * held back keeps that state out of reach.
 */
export const LAST_EVENT_SERIES_HINT =
  "Die letzte Eventreihe kann nicht gelöscht werden, damit immer eine zur Auswahl steht.";

/**
 * Whether at least one class of the series is currently open (US-43, US-44). Archiving and the
 * header's door both ask this rather than any single class' state: a series with one class still
 * open is not one a teacher can safely put away, and its door is not one they would call shut.
 */
export function anyClassOpen(
  classOptions: readonly Pick<ClassOption, "isOpenToStudents">[],
): boolean {
  return classOptions.some((option) => option.isOpenToStudents);
}

/**
 * Whether the one class a record or a link names is currently open (US-43). `null`, or a name the
 * series carries no such class under, answers false: a question with no class behind it has no
 * open window to ask about.
 */
export function classIsOpen(
  classOptions: readonly Pick<ClassOption, "name" | "isOpenToStudents">[],
  className: string | null,
): boolean {
  if (className === null) return false;
  const wanted = normalizeName(className);
  return classOptions.some(
    (option) => normalizeName(option.name) === wanted && option.isOpenToStudents,
  );
}

/**
 * What the list says about a series (US-19) — derived from the stored flags, never persisted.
 *
 * Archiving wins: it closes a series and takes away every screen that could show it, so a record
 * that somehow says both still resolves to exactly one state.
 */
export function eventSeriesState(
  eventSeries: Pick<EventSeries, "isArchived" | "classOptions">,
): EventSeriesState {
  if (eventSeries.isArchived) return "archived";
  return anyClassOpen(eventSeries.classOptions) ? "open" : "closed";
}

export const EVENT_SERIES_STATE_LABELS: Record<EventSeriesState, string> = {
  archived: "Archiviert",
  open: "Registrierung für Schüler:innen offen",
  closed: "Registrierung für Schüler:innen geschlossen",
};

/**
 * How a series is named where several are listed together. Archived is said in words rather than
 * by colour, so a list that mixes the two reads the same wherever it is shown (US-19, US-22).
 */
export function eventSeriesLabel(eventSeries: Pick<EventSeries, "name" | "isArchived">): string {
  return eventSeries.isArchived
    ? `${eventSeries.name} (${EVENT_SERIES_STATE_LABELS.archived})`
    : eventSeries.name;
}

/** Archived event series are hidden by default; the list offers a toggle to bring them back (US-19). */
export function visibleEventSeries<T extends Pick<EventSeries, "isArchived">>(
  allEventSeries: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? allEventSeries : allEventSeries.filter((one) => !one.isArchived);
}
