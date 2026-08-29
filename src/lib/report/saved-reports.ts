/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { prunedToLists, sameFilter } from "@/lib/filters/student-filter";
import { fieldTagsFor } from "@/lib/report/report-fields";
import type { AnswerField, EventSeriesListField } from "@/lib/master-data/categories";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { ReportSelection, SavedReport } from "@/lib/schemas/saved-report";

/**
 * A saved report filters on the lists of one event series, so it lives beneath that series
 * rather than beside it — which is what keeps a report of a Wintersportwoche out of a
 * Kulturwoche's tag row, and what lets a copy take its source's reports along (US-22).
 *
 * Beneath rather than inside: a rule grants a whole document or none of it, and a student reads
 * the event series document to be asked its questions (US-11). A field would hand them every
 * report of every series; a subcollection has a rule of its own.
 */
export function savedReportPath(eventSeriesId: string): string {
  return `${COLLECTIONS.eventSeries}/${eventSeriesId}/${COLLECTIONS.savedReports}`;
}

/** Which order the tags were pressed in is no part of what a report shows (US-13). */
function sameFields(left: readonly string[], right: readonly string[]): boolean {
  const chosen = new Set(left);
  return chosen.size === new Set(right).size && right.every((key) => chosen.has(key));
}

/**
 * A saved report holding only what its series still asks for (US-21). A list a teacher has since
 * emptied takes its tags and its field with it: the report would otherwise filter on an answer
 * nobody can give any more, and print a line reading "keine Angabe" for every student.
 */
export function prunedSelection<T extends ReportSelection>(
  selection: T,
  eventSeries: Pick<EventSeries, EventSeriesListField>,
): T {
  const offered = new Set(fieldTagsFor(eventSeries).map((tag) => tag.key));

  return {
    ...selection,
    filter: prunedToLists(selection.filter, eventSeries),
    fields: selection.fields.filter((key) => offered.has(key)),
  };
}

/** What one list edit was: which answer it is behind, and what it renamed while it was there. */
export type ListEdit = {
  answer: AnswerField;
  renamed: ReadonlyMap<string, string>;
};

/**
 * A saved report as one edit of one list leaves it, written back in the same transaction as the
 * edit itself (US-13, US-21) — so what a report holds is true of its series at rest, and no
 * reader has to prune what it was given.
 *
 * A renamed value is carried across rather than dropped: the teacher renamed a class, they did
 * not stop wanting to see it. A removed one goes, along with the field for a list that is now
 * empty. The rename is scoped to the answer the edited list is behind, so a program and a class
 * that happen to share a name do not rename each other.
 */
export function afterListEdit<T extends ReportSelection>(
  selection: T,
  eventSeries: Pick<EventSeries, EventSeriesListField>,
  { answer, renamed }: ListEdit,
): T {
  const chosen = selection.filter.tags[answer];
  const carried = { ...selection.filter.tags, [answer]: chosen.map((v) => renamed.get(v) ?? v) };

  return prunedSelection(
    { ...selection, filter: { ...selection.filter, tags: carried } },
    eventSeries,
  );
}

/** Whether a saved report is what the page currently shows, both selections at once (US-13). */
export function sameSelection(saved: ReportSelection, current: ReportSelection): boolean {
  return sameFilter(saved.filter, current.filter) && sameFields(saved.fields, current.fields);
}

/**
 * The saved report the page currently is, or null where it is none of them. What the tag row
 * colours a marked tag by and what an export is named after (US-13, US-17); asked once here, the
 * two cannot come to disagree about which report a teacher is looking at.
 */
export function matchingSavedReport(
  reports: readonly SavedReport[],
  current: ReportSelection,
): SavedReport | null {
  return reports.find((candidate) => sameSelection(candidate, current)) ?? null;
}
