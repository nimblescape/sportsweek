/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { FilterableStudent } from "@/lib/filters/student-filter";
import type { EventSeriesListField } from "@/lib/master-data/categories";
import { questionsFor } from "@/lib/master-data/resolution";
import { isRegistrationIncomplete } from "@/lib/registration/completeness";
import type { Uid } from "@/lib/schemas/common";
import type { EventSeries } from "@/lib/schemas/event-series";
import type { Registration } from "@/lib/schemas/registration";

export type RosterStudent = FilterableStudent & {
  /** The registration, which is what an assignment is written to (US-12). */
  id: Uid;
  studentUid: Uid;
  /** On the report's master line, where it is the one contact detail always shown (US-13). */
  email: string;
  /**
   * The registration whole, because the report's detail lines may ask for any answer in it
   * (US-13). The fields above it are the projection the filter is written against, so a row
   * answers both questions without the two views joining the same records twice.
   */
  record: Registration;
};

const byName = new Intl.Collator("de-AT").compare;

/**
 * One row per registration, named from the registration itself: it carries the student's name
 * and e-mail address, written from the session on every save and corrected at every login
 * (US-26), so a roster is a projection of one collection rather than a join to `users`.
 *
 * `isIncomplete` is derived here rather than read off the record: it depends on what the series
 * currently asks (US-36), which a master-data edit can change for every registration at once
 * without writing any of them, so a stored mark could only ever be right by coincidence.
 *
 * Sorted alphabetically rather than by a stored position: a teacher orders the lists they
 * maintain (see Ordering), but the students in them are looked up by name.
 */
export function toRoster(
  records: readonly Registration[],
  eventSeries: Pick<EventSeries, EventSeriesListField>,
): RosterStudent[] {
  return records
    .map((record) => ({
      id: record.id,
      studentUid: record.studentUid,
      email: record.email,
      record,
      firstName: record.firstName,
      lastName: record.lastName,
      class: record.class,
      gender: record.gender,
      program: record.program,
      skillLevel: record.skillLevel,
      isAttending: record.isAttendingSportsWeek,
      isIncomplete: isRegistrationIncomplete(record, questionsFor(eventSeries, record.event)),
      event: record.event,
      equipmentRentalNeeded: record.equipmentRentalNeeded,
      healthNotes: record.healthNotes,
      hasMedication: record.hasMedication,
      busPickupPoint: record.busPickupPoint,
      seasonPassOption: record.seasonPassOption,
      foodOption: record.foodOption,
    }))
    .sort(
      (left, right) =>
        byName(left.lastName, right.lastName) || byName(left.firstName, right.firstName),
    );
}
