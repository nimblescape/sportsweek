/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import type { EventSeries } from "@/lib/schemas/event-series";
import { eventSeriesRoutes } from "@/lib/routes";

/**
 * How an item is recognised as still in use (US-5 to US-10). A registration stores the name it
 * selected rather than a reference (US-11), so "in use" is a name match, not a join — and the
 * field to match differs per category.
 */
export type MasterDataUsage = { kind: "masterData"; field: string };

/**
 * Which fields of the event series document hold a maintained list — derived, so a list added to
 * the schema is offerable here and a field renamed there stops compiling (US-21).
 */
export type EventSeriesListField = {
  [Key in keyof EventSeries]: EventSeries[Key] extends readonly unknown[] ? Key : never;
}[keyof EventSeries];

export type MasterDataCategory = {
  /** The event series document field this list is stored in; there is no collection (US-21). */
  field: EventSeriesListField;
  usage: MasterDataUsage;
  /**
   * Set only for a category whose items carry a list of their own. Its entries are matched
   * against the students' rental selections, not against the field above (US-5).
   */
  equipmentField?: string;
  labels: {
    title: string;
    singular: string;
    /** Carries the article, which German needs and a title plus a noun cannot supply. */
    add: string;
    /** Shown when the list is empty. */
    empty: string;
    /**
     * What the value this list supplies is called wherever it is shown — asked of a student,
     * printed in a report, offered as a filter category. Usually the singular, but not always:
     * one adds an option to a "Verpflegungsoption" list and answers a question about
     * "Verpflegung". Not every list is asked of anybody: a teacher assigns the event (US-12).
     */
    answer: string;
  };
};

/**
 * The seven teacher-maintained lists, keyed by the URL segment under a series' master data, in
 * the order the menu shows them. The event series itself is not here: it carries archived and
 * template state of its own and is maintained on the one page that is not scoped to a selection.
 *
 * The events lead because they are the series divided into weeks, and everything else describes
 * the students within it — the order the report fields and the filter categories already follow.
 */
export const MASTER_DATA_CATEGORIES = {
  events: {
    field: "events",
    // The one list nobody is asked for: a teacher assigns the event (US-12), so this field is
    // matched only by the in-use guard, which refuses to remove an event somebody is assigned to.
    usage: { kind: "masterData", field: "event" },
    labels: {
      title: "Events",
      singular: "Event",
      add: "Neues Event",
      empty: "Es gibt noch kein Event.",
      answer: "Event",
    },
  },
  classes: {
    field: "classOptions",
    usage: { kind: "masterData", field: "class" },
    labels: {
      title: "Klassen",
      singular: "Klasse",
      add: "Neue Klasse",
      empty: "Es gibt noch keine Klasse.",
      answer: "Klasse",
    },
  },
  programs: {
    field: "programs",
    usage: { kind: "masterData", field: "program" },
    equipmentField: "requiredEquipment",
    labels: {
      title: "Programme",
      singular: "Programm",
      add: "Neues Programm",
      empty: "Es gibt noch kein Programm.",
      answer: "Programm",
    },
  },
  "skill-levels": {
    field: "skillLevels",
    usage: { kind: "masterData", field: "skillLevel" },
    labels: {
      title: "Leistungsstufen",
      singular: "Leistungsstufe",
      add: "Neue Leistungsstufe",
      empty: "Es gibt noch keine Leistungsstufe.",
      answer: "Leistungsstufe",
    },
  },
  "season-pass-options": {
    field: "seasonPassOptions",
    usage: { kind: "masterData", field: "seasonPassOption" },
    labels: {
      title: "Zugangskarten",
      singular: "Zugangskarte",
      add: "Neue Zugangskarte",
      empty: "Es gibt noch keine Zugangskarte.",
      answer: "Zugangskarte",
    },
  },
  "bus-pickup-points": {
    field: "busPickupPoints",
    usage: { kind: "masterData", field: "busPickupPoint" },
    labels: {
      title: "Zustiegsstellen",
      singular: "Zustiegsstelle",
      add: "Neue Zustiegsstelle",
      empty: "Es gibt noch keine Zustiegsstelle.",
      answer: "Zustiegsstelle",
    },
  },
  "food-options": {
    field: "foodOptions",
    usage: { kind: "masterData", field: "foodOption" },
    labels: {
      title: "Verpflegung",
      singular: "Verpflegungsoption",
      add: "Neue Verpflegungsoption",
      empty: "Es gibt noch keine Verpflegungsoption.",
      answer: "Verpflegung",
    },
  },
} as const satisfies Record<string, MasterDataCategory>;

export type MasterDataCategoryKey = keyof typeof MASTER_DATA_CATEGORIES;

/** The registration fields the maintained lists supply an answer for (US-5 to US-11). */
export type AnswerField = (typeof MASTER_DATA_CATEGORIES)[MasterDataCategoryKey]["usage"]["field"];

/**
 * The answers this event series asks a student for: one per maintained list that has entries.
 *
 * An empty list is a question the student is never asked (US-21), which is what lets one
 * application serve a Kulturwoche as well as a Wintersportwoche without a setting deciding which
 * questions apply — the lists already say, by being there or not. So it is also what the form
 * renders, what completeness counts and what the report and the filter offer: a question nobody
 * was asked cannot be missing, and cannot be reported on.
 */
export function questionsAsked(
  eventSeries: Pick<EventSeries, EventSeriesListField>,
): ReadonlySet<AnswerField> {
  return new Set(
    Object.values(MASTER_DATA_CATEGORIES)
      .filter((category) => eventSeries[category.field].length > 0)
      .map((category) => category.usage.field),
  );
}

/**
 * Whether renting is asked at all. It is put to a student whose chosen program requires
 * something, so a series where no program requires anything never puts the question — which
 * makes it US-21's rule again, with the list one step further off than the other six.
 */
export function rentsEquipment(eventSeries: Pick<EventSeries, "programs">): boolean {
  return eventSeries.programs.some((program) => program.requiredEquipment.length > 0);
}

/**
 * What each of those answers is called in German, keyed by the field that stores it. The form
 * asks for it, the report prints it, the filter offers it as a category and the completeness
 * check names it as still owed — one word rather than four that drift apart at the next rename.
 */
export const ANSWER_LABELS = Object.fromEntries(
  Object.values(MASTER_DATA_CATEGORIES).map((category) => [
    category.usage.field,
    category.labels.answer,
  ]),
) as Record<AnswerField, string>;

/**
 * The master data menu, in the order it is shown (US-4 to US-10). Every list belongs to one event
 * series, so the entries are built from the selected one's id (Q8). The event series list leads and
 * is the exception twice over: it is not a category, and it is the one page not scoped to the
 * selection — it is where the things the header offers are maintained (US-19).
 *
 * With nothing selected it is also the only entry left, since the other six would have no series
 * to be about.
 */
export function masterDataSections(eventSeriesId: string | null) {
  const eventSeriesList = { href: "/app/event-series", label: "Eventreihen" };
  if (eventSeriesId === null) return [eventSeriesList];

  return [
    eventSeriesList,
    ...Object.entries(MASTER_DATA_CATEGORIES).map(([key, category]) => ({
      href: `/app/${encodeURIComponent(eventSeriesId)}/master-data/${key}`,
      label: category.labels.title,
    })),
  ];
}

/** Where the section opens: its first category, the section itself having no view of its own. */
export function firstMasterDataPath(eventSeriesId: string): string {
  const [first] = Object.keys(MASTER_DATA_CATEGORIES);
  return `${eventSeriesRoutes(eventSeriesId).masterData}/${first}`;
}

/**
 * Lives here rather than next to the server-side guard because the list view shows the same
 * sentence on the controls it disables, and must not pull the Admin SDK in to do so.
 *
 * It names no way out on purpose. The list belongs to this event series (US-21) and the guard
 * reads this series' own registrations, so archiving would not free the entry — it would take the
 * whole series off every screen instead (US-19). What frees it is the registration going.
 */
export const IN_USE_HINT =
  "Dieser Eintrag wurde in einer Anmeldung dieser Eventreihe gewählt und kann " +
  "deshalb nicht umbenannt oder gelöscht werden.";

/** Deleting a program takes its equipment with it, so a rented item holds the program back too. */
export const CHILD_IN_USE_HINT =
  "Ausrüstung dieses Programms wurde in einer Anmeldung dieser Eventreihe ausgeliehen. " +
  "Das Programm kann deshalb nicht gelöscht werden.";

/**
 * Shown while the answer is still on its way. The controls stay disabled until it arrives, so
 * this is the only reason a teacher can be given for them — and the alternative, enabling them
 * and withdrawing them a moment later, offers something the list already knows it may refuse.
 */
export const USAGE_PENDING_HINT =
  "Es wird noch geprüft, ob dieser Eintrag in Anmeldungen verwendet wird.";

/** Labels for the equipment list a program carries, which is a field rather than a category. */
export const EQUIPMENT_LABELS = {
  title: "Benötigte Ausrüstung",
  singular: "Ausrüstungsgegenstand",
  add: "Neuer Ausrüstungsgegenstand",
  empty: "Dieses Programm benötigt keine Ausrüstung.",
} as const;

/** Route segments arrive as untrusted strings, so a key is validated before it names a collection. */
export const masterDataCategorySchema = z.enum(
  Object.keys(MASTER_DATA_CATEGORIES) as [MasterDataCategoryKey, ...MasterDataCategoryKey[]],
);

export function categoryOf(key: MasterDataCategoryKey): MasterDataCategory {
  return MASTER_DATA_CATEGORIES[key];
}
