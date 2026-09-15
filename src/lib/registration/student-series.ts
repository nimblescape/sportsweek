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
 * The event series a student has already joined, in the teacher's order, archived ones aside.
 *
 * Not filtered on open any more (US-43, US-45): "open" is a fact about a class now, not the
 * series, and a closed class still shows its student their own registration, read-only — only
 * archiving takes a series off this list. And held rather than merely open, because joining is
 * what a link does (US-23) — a series nobody invited them to is not theirs.
 */
export async function openSeriesOfStudent(studentUid: string): Promise<EventSeries[]> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isArchived", "==", false)
    .get();

  const open = snapshot.docs.map((series) =>
    eventSeriesSchema.parse({ id: series.id, ...series.data() }),
  );

  const held = await Promise.all(
    open.map(async (series) => {
      const stored = await adminDb.collection(registrationPath(series.id)).doc(studentUid).get();
      return stored.exists ? series : null;
    }),
  );

  return held
    .filter((series) => series !== null)
    .sort((one, other) => one.position - other.position);
}
