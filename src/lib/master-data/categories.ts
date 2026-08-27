/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { COLLECTIONS } from "@/lib/schemas/collections";

/**
 * How an item is recognised as still in use (US-5 to US-10). Master data stores plain-text
 * snapshots rather than references (US-11), so "in use" is a name match, not a join — and the
 * field to match differs per category.
 */
export type MasterDataUsage = { kind: "masterData"; field: string };

export type MasterDataCategory = {
  collection: string;
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
     * What the answer this list supplies is called wherever a student is asked it, a report
     * prints it or a filter offers it. Usually the singular, but not always: one adds an option
     * to a "Verpflegungsoption" list and answers a question about "Verpflegung".
     */
    answer: string;
  };
};

/**
 * The six teacher-maintained lists, keyed by the URL segment under /app/master-data, in the order
 * the menu shows them. EventSeries are not here: they carry active/archived state of their own and
 * keep their dedicated view.
 */
export const MASTER_DATA_CATEGORIES = {
  classes: {
    collection: COLLECTIONS.classOptions,
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
    collection: COLLECTIONS.programs,
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
    collection: COLLECTIONS.skillLevels,
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
    collection: COLLECTIONS.seasonPassOptions,
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
    collection: COLLECTIONS.busPickupPoints,
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
    collection: COLLECTIONS.foodOptions,
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
type AnswerField = (typeof MASTER_DATA_CATEGORIES)[MasterDataCategoryKey]["usage"]["field"];

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
 * The master data menu, in the order it is shown (US-4 to US-10). EventSeries lead and are not a
 * category, so they are the one entry named here rather than derived.
 */
export const MASTER_DATA_SECTIONS = [
  { href: "/app/master-data/event-series", label: "Eventreihen" },
  ...Object.entries(MASTER_DATA_CATEGORIES).map(([key, category]) => ({
    href: `/app/master-data/${key}`,
    label: category.labels.title,
  })),
];

/**
 * Lives here rather than next to the server-side guard because the list view shows the same
 * sentence on the controls it disables, and must not pull the Admin SDK in to do so.
 */
export const IN_USE_HINT =
  "Dieser Eintrag wird in den Anmeldungen einer nicht archivierten Eventreihe noch " +
  "verwendet. Archiviere diese Eventreihe, um ihn zu bearbeiten oder zu löschen.";

/** Deleting a program takes its equipment with it, so a rented item holds the program back too. */
export const CHILD_IN_USE_HINT =
  "Ausrüstung dieses Programms wird in den Anmeldungen einer nicht archivierten Eventreihe " +
  "noch verwendet. Archiviere diese Eventreihe, um das Programm zu löschen.";

/**
 * Shown while the answer is still on its way. The controls stay disabled until it arrives, so
 * this is the only reason a teacher can be given for them — and the alternative, enabling them
 * and withdrawing them a moment later, offers something the list already knows it may refuse.
 */
export const USAGE_PENDING_HINT =
  "Es wird noch geprüft, ob dieser Eintrag in Anmeldungen verwendet wird.";

/**
 * What is left behind when an item is removed or renamed — and it is only ever archived data,
 * because the in-use rule above is what allowed the edit in the first place: an entry a
 * non-archived event series still holds cannot be touched at all.
 */
export const ARCHIVED_DATA_UNCHANGED_HINT =
  "Bereits gespeicherte Anmeldungen in archivierten Eventreihen bleiben unverändert.";

/** The records hold the name itself, so an archived one goes on holding the one it was given. */
export const ARCHIVED_DATA_KEEPS_NAME_HINT =
  "Bereits gespeicherte Anmeldungen in archivierten Eventreihen behalten den bisherigen Namen.";

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
