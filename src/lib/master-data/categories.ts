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
 * field to match differs per category. Required equipment items are the odd one out: they are
 * matched through the students' rental selections, not through the program they belong to.
 */
export type MasterDataUsage = { kind: "masterData"; field: string } | { kind: "rentalItem" };

export type MasterDataCategory = {
  collection: string;
  usage: MasterDataUsage;
  /** Set only for a nested list: the field on the item that names its owner. */
  parentField?: string;
  /** Set only for a category that owns a nested list, which a delete has to take with it. */
  childKey?: string;
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
    childKey: "required-equipment",
    labels: {
      title: "Programme",
      singular: "Programm",
      add: "Neues Programm",
      empty: "Es gibt noch kein Programm.",
    },
  },
  "required-equipment": {
    collection: COLLECTIONS.requiredEquipmentItems,
    usage: { kind: "rentalItem" },
    parentField: "programId",
    labels: {
      title: "Benötigte Ausrüstung",
      singular: "Ausrüstungsgegenstand",
      add: "Neuer Ausrüstungsgegenstand",
      empty: "Dieses Programm benötigt keine Ausrüstung.",
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
      title: "Könnensstufen",
      singular: "Könnensstufe",
      add: "Neue Könnensstufe",
      empty: "Es gibt noch keine Könnensstufe.",
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

/** Route segments arrive as untrusted strings, so a key is validated before it names a collection. */
export const masterDataCategorySchema = z.enum(
  Object.keys(MASTER_DATA_CATEGORIES) as [MasterDataCategoryKey, ...MasterDataCategoryKey[]],
);

export function categoryOf(key: MasterDataCategoryKey): MasterDataCategory {
  return MASTER_DATA_CATEGORIES[key];
}
