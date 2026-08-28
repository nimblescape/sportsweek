/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { reorderCollection } from "@/lib/firebase/reorder";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { NO_SUCH_EVENT_SERIES } from "@/lib/event-series/event-series-state";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { savedReportPath } from "@/lib/report/saved-reports";
import {
  savedReportEditSchema,
  savedReportInputSchema,
  savedReportSchema,
  type SavedReport,
  type SavedReportEdit,
  type SavedReportInput,
} from "@/lib/schemas/saved-report";

function reportDoc(eventSeriesId: string, id: string) {
  return adminDb.collection(savedReportPath(eventSeriesId)).doc(id);
}

function reject(message: string): never {
  throw new ServiceError(ErrorCode.ValidationError, message);
}

async function readReport(eventSeriesId: string, id: string): Promise<SavedReport> {
  const snapshot = await reportDoc(eventSeriesId, id).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Bericht gibt es nicht.");
  }

  const parsed = savedReportSchema.safeParse({ id, ...snapshot.data() });
  if (!parsed.success) {
    throw new ServiceError(ErrorCode.InternalError, "Dieser Bericht ist beschädigt.");
  }
  return parsed.data;
}

/**
 * Saved reports go through handlers rather than straight from the browser, because the author
 * is the session's and not the request's — the declarative write path stays closed (see
 * firestore.rules). They are shared among all teachers, so who saved one decides nothing about
 * who may open, rename or remove it (US-13).
 *
 * In a transaction that first reads the series, because Firestore writes a subcollection under a
 * document that is not there: without the read, a save into a series deleted meanwhile would
 * leave a report no teacher can reach and no delete will ever sweep.
 */
export async function createSavedReport(
  eventSeriesId: string,
  input: SavedReportInput,
  createdByUserId: string,
): Promise<SavedReport> {
  const parsed = savedReportInputSchema.safeParse(input);
  if (!parsed.success) {
    reject(parsed.error.issues[0]?.message ?? "Dieser Bericht lässt sich nicht speichern.");
  }

  const row = adminDb.collection(savedReportPath(eventSeriesId));

  return adminDb.runTransaction(async (transaction) => {
    const series = await transaction.get(
      adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId),
    );
    if (!series.exists) throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);

    // A new report's tag goes to the end of the row, where the button that made it stands, and
    // stays there (see Ordering). Counted in the transaction, so two saves cannot tie.
    const existing = await transaction.get(row);

    const reference = row.doc();
    const data = { ...parsed.data, createdByUserId, position: existing.size };
    transaction.set(reference, data);

    return { id: reference.id, ...data };
  });
}

/**
 * An edit replaces everything a teacher may change. Renaming and bringing up to date are one
 * write rather than two: the tag a teacher renames is the report they are looking at, and
 * storing the name without the selection is what left it reading as changed afterwards (US-13).
 */
export async function updateSavedReport(
  eventSeriesId: string,
  id: string,
  input: SavedReportEdit,
): Promise<SavedReport> {
  const parsed = savedReportEditSchema.safeParse(input);
  if (!parsed.success) {
    reject(parsed.error.issues[0]?.message ?? "Dieser Bericht lässt sich nicht speichern.");
  }

  const current = await readReport(eventSeriesId, id);

  await reportDoc(eventSeriesId, id).update(parsed.data);
  return { ...current, ...parsed.data };
}

export async function deleteSavedReport(eventSeriesId: string, id: string): Promise<void> {
  await readReport(eventSeriesId, id);
  await reportDoc(eventSeriesId, id).delete();
}

/** Ordering changes nothing a report holds, so it is open to any teacher (see Ordering). */
export async function reorderSavedReports(
  eventSeriesId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await reorderCollection({ collection: savedReportPath(eventSeriesId), orderedIds });
}
