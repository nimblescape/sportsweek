/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import {
  EQUIPMENT_LABELS,
  MASTER_DATA_CATEGORIES,
  PER_EVENT_CATEGORY_KEYS,
  type MasterDataCategoryKey,
  type PerEventCategoryKey,
} from "@/lib/master-data/categories";
import { ROUTES } from "@/lib/routes";

/**
 * The master data hierarchy has one shape, repeated (US-33): a screen shows one **record**, its
 * **child collections** are a row of tags, and the marked tag's entries are the list beneath.
 * This module owns that shape — where each record lives, what hangs beneath it, and how a page
 * names the way back — so the four screens cannot come to disagree about any of it.
 */

/** A step of the way down. The trail ends at the record on screen, which the title repeats. */
export type Crumb = { label: string; href: string };

/** One child collection of the record on screen, as the tag row offers it. */
export type RecordTab = {
  key: string;
  label: string;
  href: string;
  /** The wording of the add control the marked tag carries, which is the collection's own. */
  addLabel: string;
  /** Whether its entries have record pages of their own, which is what makes it a step down. */
  opensRecords: boolean;
};

const EVENT_SERIES_TAB: RecordTab = {
  key: "event-series",
  label: "Eventreihen",
  href: ROUTES.eventSeries,
  addLabel: "Neue Eventreihe",
  opensRecords: true,
};

export const ROOT_TABS: readonly RecordTab[] = [EVENT_SERIES_TAB];

export function masterDataPath(eventSeriesId: string, category: MasterDataCategoryKey): string {
  return `${ROUTES.eventSeries}/${encodeURIComponent(eventSeriesId)}/${category}`;
}

/**
 * A program is identified by its name (US-21), which a teacher typed and may hold a `/`, a `#`
 * or a `+`. A path segment is re-normalised between the browser and the page, so the name goes
 * in a search parameter — encoded, since a query reads a literal `+` as a space.
 */
export function equipmentPath(eventSeriesId: string, program: string): string {
  return `${masterDataPath(eventSeriesId, "programs")}?equipment=${encodeURIComponent(program)}`;
}

/**
 * A category on an event's own page (US-33). `events` is a static segment rather than a dynamic
 * one, because it is the only category whose entries have children of their own and a static
 * segment wins over a dynamic one — `{category}` still names which of the event's five lists.
 */
export function eventCategoryPath(
  eventSeriesId: string,
  eventName: string,
  category: PerEventCategoryKey,
): string {
  return (
    `${ROUTES.eventSeries}/${encodeURIComponent(eventSeriesId)}/events/${category}` +
    `?event=${encodeURIComponent(eventName)}`
  );
}

/** A series-level program's equipment one level up, at an event's own program instead. */
export function eventEquipmentPath(
  eventSeriesId: string,
  eventName: string,
  program: string,
): string {
  return `${eventCategoryPath(eventSeriesId, eventName, "programs")}&equipment=${encodeURIComponent(program)}`;
}

/** Where a series' record opens, the record itself having no view of its own. */
export function eventSeriesRecordPath(eventSeriesId: string): string {
  const [first] = Object.keys(MASTER_DATA_CATEGORIES) as MasterDataCategoryKey[];

  return masterDataPath(eventSeriesId, first);
}

/** Where an event's own record opens, mirroring a series' record having no view of its own. */
export function eventRecordPath(eventSeriesId: string, eventName: string): string {
  const [first] = PER_EVENT_CATEGORY_KEYS;

  return eventCategoryPath(eventSeriesId, eventName, first);
}

export function categoryTabs(eventSeriesId: string): RecordTab[] {
  return Object.entries(MASTER_DATA_CATEGORIES).map(([key, category]) => ({
    key,
    label: category.labels.title,
    href: masterDataPath(eventSeriesId, key as MasterDataCategoryKey),
    addLabel: category.labels.add,
    opensRecords: category.opensRecords,
  }));
}

/** Equipment belongs to the program that requires it, so the leaf's row has the one tag. */
export function equipmentTabs(eventSeriesId: string, program: string): RecordTab[] {
  return [
    {
      key: "required-equipment",
      label: EQUIPMENT_LABELS.title,
      href: equipmentPath(eventSeriesId, program),
      addLabel: EQUIPMENT_LABELS.add,
      opensRecords: false,
    },
  ];
}

/** An event's own tag row: the five categories it may override, and none of the other two. */
export function eventTabs(eventSeriesId: string, eventName: string): RecordTab[] {
  return PER_EVENT_CATEGORY_KEYS.map((key) => {
    const category = MASTER_DATA_CATEGORIES[key];

    return {
      key,
      label: category.labels.title,
      href: eventCategoryPath(eventSeriesId, eventName, key),
      addLabel: category.labels.add,
      opensRecords: category.opensRecords,
    };
  });
}

/** Equipment belongs to the program that requires it, even one that is itself an event's own. */
export function eventEquipmentTabs(
  eventSeriesId: string,
  eventName: string,
  program: string,
): RecordTab[] {
  return [
    {
      key: "required-equipment",
      label: EQUIPMENT_LABELS.title,
      href: eventEquipmentPath(eventSeriesId, eventName, program),
      addLabel: EQUIPMENT_LABELS.add,
      opensRecords: false,
    },
  ];
}

const EVENT_SERIES_CRUMB: Crumb = { label: EVENT_SERIES_TAB.label, href: EVENT_SERIES_TAB.href };

/**
 * The ancestors of what a screen shows; the screen itself ends the path with the collection on
 * show. The root has none, so its whole path is that one step.
 */
export function rootTrail(): Crumb[] {
  return [];
}

/** The path down to one event series' record. */
export function eventSeriesTrail(eventSeriesId: string, eventSeriesName: string): Crumb[] {
  return [
    EVENT_SERIES_CRUMB,
    { label: eventSeriesName, href: eventSeriesRecordPath(eventSeriesId) },
  ];
}

/** The path down to one program, whose required equipment the leaf lists. */
export function programTrail(
  eventSeriesId: string,
  eventSeriesName: string,
  program: string,
): Crumb[] {
  return [
    ...eventSeriesTrail(eventSeriesId, eventSeriesName),
    {
      label: MASTER_DATA_CATEGORIES.programs.labels.title,
      href: masterDataPath(eventSeriesId, "programs"),
    },
    { label: program, href: equipmentPath(eventSeriesId, program) },
  ];
}

/** The path down to one event's record, an event now carrying lists of its own (US-33). */
export function eventTrail(
  eventSeriesId: string,
  eventSeriesName: string,
  eventName: string,
): Crumb[] {
  return [
    ...eventSeriesTrail(eventSeriesId, eventSeriesName),
    {
      label: MASTER_DATA_CATEGORIES.events.labels.title,
      href: masterDataPath(eventSeriesId, "events"),
    },
    { label: eventName, href: eventRecordPath(eventSeriesId, eventName) },
  ];
}

/** The path down to one of an event's own programs, whose required equipment the leaf lists. */
export function eventEquipmentTrail(
  eventSeriesId: string,
  eventSeriesName: string,
  eventName: string,
  program: string,
): Crumb[] {
  return [
    ...eventTrail(eventSeriesId, eventSeriesName, eventName),
    {
      label: MASTER_DATA_CATEGORIES.programs.labels.title,
      href: eventCategoryPath(eventSeriesId, eventName, "programs"),
    },
    { label: program, href: eventEquipmentPath(eventSeriesId, eventName, program) },
  ];
}
