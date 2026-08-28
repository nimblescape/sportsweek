/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { registrationPath } from "./registration";

/**
 * The open event series a student has already joined, in the teacher's order.
 *
 * Open rather than merely held, which is the whole of why a student is not asked to choose every
 * year from their second sports week onwards (Q7): past series are closed or archived, so three
 * registrations still leave exactly one live answer. And held rather than merely open, because
 * joining is what a link does (US-23) — an open series nobody invited them to is not theirs.
 */
export async function openSeriesOfStudent(studentUpn: string): Promise<EventSeries[]> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isOpenToStudents", "==", true)
    .get();

  const open = snapshot.docs.map((series) =>
    eventSeriesSchema.parse({ id: series.id, ...series.data() }),
  );

  const held = await Promise.all(
    open.map(async (series) => {
      const stored = await adminDb.collection(registrationPath(series.id)).doc(studentUpn).get();
      return stored.exists ? series : null;
    }),
  );

  return held
    .filter((series) => series !== null)
    .sort((one, other) => one.position - other.position);
}
