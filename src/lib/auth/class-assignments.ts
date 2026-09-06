/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/name-key";
import { asUid } from "@/lib/schemas/common";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import type { ClassAssignment } from "@/lib/schemas/invited-teacher";

/** Every class an invitation named in one series, so one series is written to once. */
function classNamesBySeries(
  assignments: readonly ClassAssignment[],
): Map<string, readonly string[]> {
  const bySeries = new Map<string, string[]>();
  for (const assignment of assignments) {
    const classNames = bySeries.get(assignment.eventSeriesId);
    if (classNames) classNames.push(assignment.class);
    else bySeries.set(assignment.eventSeriesId, [assignment.class]);
  }
  return bySeries;
}

async function claimInSeries(
  eventSeriesId: string,
  classNames: readonly string[],
  uid: string,
): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
  const snapshot = await ref.get();
  // The series is gone (Q4) — nothing here is an error, and nothing reports it.
  if (!snapshot.exists) return;

  const series = eventSeriesSchema.safeParse({ id: eventSeriesId, ...snapshot.data() });
  if (!series.success) return;

  const wanted = new Set(classNames.map(normalizeName));
  const teacherUid = asUid(uid);
  let changed = false;
  const classOptions = series.data.classOptions.map((option) => {
    if (!wanted.has(normalizeName(option.name)) || option.teacherUids.includes(teacherUid)) {
      return option;
    }
    changed = true;
    return { ...option, teacherUids: [...option.teacherUids, teacherUid] };
  });

  if (changed) await ref.update({ classOptions });
}

/**
 * Applies the class assignments a claimed invitation carried (US-40): the new uid joins each
 * named class's teachers, in the series the entry names. An entry naming a series or a class
 * that is no longer there is dropped silently (Q4) — the sign-in it runs inside of is never
 * blocked by one, and nothing here reports it.
 */
export async function applyClassAssignments(
  uid: string,
  assignments: readonly ClassAssignment[],
): Promise<void> {
  await Promise.all(
    [...classNamesBySeries(assignments)].map(([eventSeriesId, classNames]) =>
      claimInSeries(eventSeriesId, classNames, uid),
    ),
  );
}
