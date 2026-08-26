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
  };
};

/**
 * The six teacher-maintained lists, keyed by the URL segment under /app/master-data. Seasons
 * are not here: they carry active/archived state of their own and keep their dedicated view.
 */
export const MASTER_DATA_CATEGORIES = {
  programs: {
    collection: COLLECTIONS.programs,
    usage: { kind: "masterData", field: "program" },
    equipmentField: "requiredEquipment",
    labels: {
      title: "Programme",
      singular: "Programm",
      add: "Neues Programm",
      empty: "Es gibt noch kein Programm.",
    },
  },
  classes: {
    collection: COLLECTIONS.classOptions,
    usage: { kind: "masterData", field: "class" },
    labels: {
      title: "Klassen",
      singular: "Klasse",
      add: "Neue Klasse",
      empty: "Es gibt noch keine Klasse.",
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
    },
  },
  "season-pass-options": {
    collection: COLLECTIONS.seasonPassOptions,
    usage: { kind: "masterData", field: "seasonPassOption" },
    labels: {
      title: "Saisonkarten",
      singular: "Saisonkarte",
      add: "Neue Saisonkarte",
      empty: "Es gibt noch keine Saisonkarte.",
    },
  },
} as const satisfies Record<string, MasterDataCategory>;

export type MasterDataCategoryKey = keyof typeof MASTER_DATA_CATEGORIES;

/**
 * Lives here rather than next to the server-side guard because the list view shows the same
 * sentence on the controls it disables, and must not pull the Admin SDK in to do so.
 */
export const IN_USE_HINT =
  "Dieser Eintrag wird in einer nicht archivierten Saison noch verwendet. " +
  "Archiviere diese Saison, um ihn zu bearbeiten oder zu löschen.";

/** Deleting a program takes its equipment with it, so a rented item holds the program back too. */
export const CHILD_IN_USE_HINT =
  "Ausrüstung dieses Programms wird in einer nicht archivierten Saison noch verwendet. " +
  "Archiviere diese Saison, um das Programm zu löschen.";

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
