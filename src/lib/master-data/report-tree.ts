/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { EventSeries } from "@/lib/schemas/event-series";
import type { EquipmentItem, Program } from "@/lib/schemas/master-data";
import {
  EQUIPMENT_LABELS,
  MASTER_DATA_CATEGORIES,
  PER_EVENT_CATEGORY_KEYS,
  type EventSeriesListField,
  type MasterDataCategoryKey,
} from "./categories";
import {
  EQUIPMENT_RENTAL_LABEL,
  NO_EQUIPMENT_RENTAL_LABEL,
} from "@/lib/registration/answer-labels";

type EventRecord = EventSeries["events"][number];
type ListEntries = readonly (string | Program | EventRecord)[];
/** Everything the report reads of a series: its name and its lists, never its stored identity. */
type ReportableSeries = Pick<EventSeries, "name" | EventSeriesListField>;

/**
 * The master data of one record, written out as headings and entries (US-33). A section holds
 * either entries or further sections — a list of bare names is where the tree stops, and a list
 * whose entries are records goes on down.
 *
 * Built here rather than in the view so the shape a teacher reads is one testable answer, and
 * the same one at every level: what is on screen, expanded downwards.
 */
export type ReportSection = {
  title: string;
  entries: readonly string[];
  sections: readonly ReportSection[];
};

/** Said under an event that names nothing of its own, where its lists would otherwise be. */
export const INHERITS_EVERYTHING = "Verwendet die Stammdaten der Eventreihe.";

/** Said where a collection is empty, so a heading is never left standing over nothing. */
export const NOTHING_MAINTAINED = "Keine Einträge.";

const section = (
  title: string,
  entries: readonly string[] = [],
  sections: readonly ReportSection[] = [],
): ReportSection => ({ title, entries, sections });

/** An item's name, and whether the school lends it, since the report is read away from the screen. */
const equipmentLine = (item: EquipmentItem) =>
  `${item.name} (${item.isRentable ? EQUIPMENT_RENTAL_LABEL : NO_EQUIPMENT_RENTAL_LABEL})`;

export function programReport(program: Program): ReportSection {
  return section(
    program.name,
    [],
    [
      section(
        EQUIPMENT_LABELS.title,
        program.requiredEquipment.length === 0
          ? [EQUIPMENT_LABELS.empty]
          : program.requiredEquipment.map(equipmentLine),
      ),
    ],
  );
}

/** The five a place decides, as one event names them — the ones it leaves alone are not its own. */
export function eventReport(event: EventRecord): ReportSection {
  const own = PER_EVENT_CATEGORY_KEYS.filter(
    (key) => event[MASTER_DATA_CATEGORIES[key].field].length > 0,
  ).map((key) => categorySection(key, event[MASTER_DATA_CATEGORIES[key].field]));

  return own.length === 0
    ? section(event.name, [INHERITS_EVERYTHING])
    : section(event.name, [], own);
}

function categorySection(key: MasterDataCategoryKey, list: ListEntries): ReportSection {
  const { title } = MASTER_DATA_CATEGORIES[key].labels;

  if (list.length === 0) return section(title, [NOTHING_MAINTAINED]);
  if (key === "programs") return section(title, [], (list as Program[]).map(programReport));
  if (key === "events") return section(title, [], (list as EventRecord[]).map(eventReport));
  return section(title, list as string[]);
}

export function eventSeriesReport(eventSeries: ReportableSeries): ReportSection {
  const keys = Object.keys(MASTER_DATA_CATEGORIES) as MasterDataCategoryKey[];

  return section(
    eventSeries.name,
    [],
    keys.map((key) => categorySection(key, eventSeries[MASTER_DATA_CATEGORIES[key].field])),
  );
}

/** Every series the school keeps, which is what the root of the hierarchy is about. */
export function allEventSeriesReport(allEventSeries: readonly ReportableSeries[]): ReportSection[] {
  return allEventSeries.map(eventSeriesReport);
}
