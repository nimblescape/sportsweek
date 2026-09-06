/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { EventSeries } from "@/lib/schemas/event-series";
import { eventSeriesLabel } from "@/lib/event-series/event-series-state";
import type { Uid } from "@/lib/schemas/common";
import type { ClassOption, EquipmentItem, Program } from "@/lib/schemas/master-data";
import type { TeacherCandidate } from "@/lib/schemas/user";
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
type ListEntries = readonly (string | ClassOption | Program | EventRecord)[];
/** Everything the report reads of a series: what to call it and its lists, never its stored identity. */
type ReportableSeries = Pick<EventSeries, "name" | "isArchived" | EventSeriesListField>;

/**
 * A uid resolved to the name the report shows (US-46). The tree stays a pure function by being
 * handed this rather than reading `users` itself — the wall a holder of `editMasterData` cannot
 * read through declaratively (see "Where the names come from", spec/class-teachers.md).
 */
export type TeacherNames = ReadonlyMap<Uid, string>;

/** The one place the report's teacher names are built, from what the candidates route answers. */
export function teacherNamesFrom(candidates: readonly TeacherCandidate[]): TeacherNames {
  return new Map(
    candidates.map((candidate) => [candidate.uid, `${candidate.firstName} ${candidate.lastName}`]),
  );
}

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

/** A class, expanded onto who looks after it — its own bullets, empty rather than "Keine Einträge." */
function classReport(option: ClassOption, teacherNames: TeacherNames): ReportSection {
  const teachers = option.teacherUids
    .map((uid) => teacherNames.get(uid))
    .filter((name): name is string => name !== undefined);

  return section(option.name, teachers);
}

function categorySection(
  key: MasterDataCategoryKey,
  list: ListEntries,
  teacherNames: TeacherNames = new Map(),
): ReportSection {
  const { title } = MASTER_DATA_CATEGORIES[key].labels;

  if (list.length === 0) return section(title, [NOTHING_MAINTAINED]);
  if (key === "programs") return section(title, [], (list as Program[]).map(programReport));
  if (key === "events") return section(title, [], (list as EventRecord[]).map(eventReport));
  if (key === "classes")
    return section(
      title,
      [],
      (list as ClassOption[]).map((option) => classReport(option, teacherNames)),
    );
  return section(title, list as string[]);
}

export function eventSeriesReport(
  eventSeries: ReportableSeries,
  teacherNames: TeacherNames = new Map(),
): ReportSection {
  const keys = Object.keys(MASTER_DATA_CATEGORIES) as MasterDataCategoryKey[];

  return section(
    eventSeriesLabel(eventSeries),
    [],
    keys.map((key) =>
      categorySection(key, eventSeries[MASTER_DATA_CATEGORIES[key].field], teacherNames),
    ),
  );
}

/** Every series the school keeps, which is what the root of the hierarchy is about. */
export function allEventSeriesReport(
  allEventSeries: readonly ReportableSeries[],
  teacherNames: TeacherNames = new Map(),
): ReportSection[] {
  return allEventSeries.map((eventSeries) => eventSeriesReport(eventSeries, teacherNames));
}
