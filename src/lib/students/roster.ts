/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { FilterableStudent } from "@/lib/filters/student-filter";
import type { Registration } from "@/lib/schemas/registration";
import type { User } from "@/lib/schemas/user";

export type RosterStudent = FilterableStudent & {
  /** The registration, which is what an assignment is written to (US-12). */
  id: string;
  userId: string;
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
 * One row per registration, named from the user record — the registration itself holds no name,
 * because a student never types theirs (US-1, US-11).
 *
 * Sorted alphabetically rather than by a stored position: a teacher orders the lists they
 * maintain (see Ordering), but the students in them are looked up by name.
 */
export function joinRoster(
  records: readonly Registration[],
  users: readonly User[],
): RosterStudent[] {
  const byId = new Map(users.map((user) => [user.id, user]));

  return records
    .flatMap((record) => {
      const user = byId.get(record.userId);
      if (!user) {
        console.error(`No user record for ${record.userId}; leaving them out of the roster`);
        return [];
      }

      return [
        {
          id: record.id,
          userId: record.userId,
          email: user.email,
          record,
          firstName: user.firstName,
          lastName: user.lastName,
          class: record.class,
          gender: record.gender,
          program: record.program,
          skillLevel: record.skillLevel,
          isAttending: record.isAttendingSportsWeek,
          isIncomplete: record.isIncomplete,
          event: record.event,
          equipmentRentalNeeded: record.equipmentRentalNeeded,
          healthNotes: record.healthNotes,
          hasMedication: record.hasMedication,
          busPickupPoint: record.busPickupPoint,
          seasonPassOption: record.seasonPassOption,
          foodOption: record.foodOption,
        },
      ];
    })
    .sort(
      (left, right) =>
        byName(left.lastName, right.lastName) || byName(left.firstName, right.firstName),
    );
}
