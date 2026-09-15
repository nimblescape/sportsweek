/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth/permissions";
import { asUid } from "@/lib/schemas/common";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { ReportSection } from "@/lib/master-data/report-tree";
import { NO_PERMISSIONS_LABEL } from "@/lib/users/teacher-filter";
import { classAssignmentsOf } from "@/lib/users/teacher-class-assignments";
import type { Teacher } from "./use-teachers";

/** Shared with the view's own line (US-47, Q5): one sentence, not two spellings of it. */
export const LOGIN_HISTORY_LABEL = "Letzte Anmeldung";

export const RIGHTS_LABEL = "Rechte";

export const CLASSES_LABEL = "Klassen";

export const NO_CLASSES_HINT = "Betreut keine Klasse.";

/** Shared with the view's own line (US-47): the same fact, said the same way in both places. */
export const NO_LOGINS_HINT = "Noch nie angemeldet.";

/** A child section with nothing to report says so, in the section's own hint entry (Q5). */
const section = (title: string, entries: readonly string[], hint: string): ReportSection => ({
  title,
  entries: entries.length === 0 ? [hint] : entries,
  sections: [],
});

/**
 * One teacher, expanded onto what the rights page already shows for them (US-49): the address
 * as the first bullet, then the three lines a card carries, each its own child section.
 *
 * A child with nothing to report says so, in the same words the card itself uses — a bullet-less
 * heading would otherwise read as the report having missed something rather than stating a fact.
 * `logins` absent from the map is a different case from a read history that is simply empty: an
 * unsettled or refused read has nothing to say and stays silent, so it is not mistaken for "never".
 */
function teacherReport(
  teacher: Teacher,
  eventSeries: readonly EventSeries[],
  logins: ReadonlyMap<string, readonly string[]>,
): ReportSection {
  const rights = PERMISSIONS.filter((permission) => teacher.permissions.includes(permission)).map(
    (permission) => PERMISSION_LABELS[permission],
  );
  const classes = classAssignmentsOf(eventSeries, asUid(teacher.uid)).map(
    (assignment) => `${assignment.eventSeriesName}: ${assignment.className}`,
  );
  const history = logins.get(teacher.uid);

  return {
    title: `${teacher.firstName} ${teacher.lastName}`,
    entries: [teacher.email],
    sections: [
      section(RIGHTS_LABEL, rights, NO_PERMISSIONS_LABEL),
      section(CLASSES_LABEL, classes, NO_CLASSES_HINT),
      // An unsettled or refused read stays a bullet-less heading — it is not "never", so it
      // must not say so.
      history === undefined
        ? { title: LOGIN_HISTORY_LABEL, entries: [], sections: [] }
        : section(LOGIN_HISTORY_LABEL, history, NO_LOGINS_HINT),
    ],
  };
}

/** One section per teacher shown, in the order the page already sorts them in (US-49). */
export function rightsReport(
  teachers: readonly Teacher[],
  eventSeries: readonly EventSeries[],
  logins: ReadonlyMap<string, readonly string[]>,
): ReportSection[] {
  return teachers.map((teacher) => teacherReport(teacher, eventSeries, logins));
}
