/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ASSIGN_OPEN_HINT } from "@/lib/event-series/event-series-state";
import { answersOwnedByEvent } from "@/lib/master-data/resolution";
import type { AnswerField, EventSeriesListField } from "@/lib/master-data/categories";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { Registration } from "@/lib/schemas/registration";

/**
 * Why the assignment refuses, in the teacher's words. Held here rather than in the service
 * because the board has to say the same thing before the write is attempted (US-12, US-36).
 */
export const IMMOVABLE_HINTS = {
  seriesOpen: ASSIGN_OPEN_HINT,
  incomplete:
    "Wer die Registrierung noch nicht abgeschlossen hat, kann keinem Event zugeteilt werden.",
  eventAnswered:
    "Diese Person hat bereits etwas beantwortet, das nur ihr Event anbietet. " +
    "Die Zuteilung kann deshalb nicht mehr geändert werden.",
} as const;

export type ImmovableReason = keyof typeof IMMOVABLE_HINTS;

type AssignableSeries = Pick<EventSeries, "isOpenToStudents" | EventSeriesListField>;
type AssignableStudent = Pick<Registration, "event" | "isIncomplete" | AnswerField>;

/**
 * Why a teacher may not move this student at all, or `null` where they may (US-12, US-36).
 *
 * The service refuses one move at a time, in the direction it was asked for; this answers the
 * question the board has instead, which is whether any move is left — so a student it calls
 * immovable is one every drop would refuse, and the handle is taken away rather than offered for
 * a drag that could only fail.
 *
 * A student who has answered "no" is not among the answers: the board lists nobody who has
 * declined, only those still coming or still deciding — and a student still deciding is exactly
 * the "incomplete" case below.
 */
export function immovableReason(
  eventSeries: AssignableSeries,
  student: AssignableStudent,
): ImmovableReason | null {
  // Checked before the series' own state, so a registration still incomplete is what a teacher
  // hears about — the more useful thing to chase — rather than a lock that lifts on its own.
  if (student.event === null && student.isIncomplete) return "incomplete";

  if (eventSeries.isOpenToStudents) return "seriesOpen";

  if (student.event === null) return null;

  // Somebody already in an event can always be taken out of it again, so an unfinished
  // registration is no obstacle here: unassigning is the move they have left.
  return answersOwnedByEvent(eventSeries, student.event, student).length > 0
    ? "eventAnswered"
    : null;
}
