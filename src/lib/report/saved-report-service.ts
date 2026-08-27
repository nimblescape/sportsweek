/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import {
  savedReportInputSchema,
  savedReportSchema,
  savedReportSelectionSchema,
  type ReportSelection,
  type SavedReport,
  type SavedReportInput,
} from "@/lib/schemas/saved-report";

const nameSchema = savedReportSchema.shape.name;

function reportDoc(id: string) {
  return adminDb.collection(COLLECTIONS.savedReports).doc(id);
}

function reject(message: string): never {
  throw new ServiceError(ErrorCode.ValidationError, message);
}

function parseName(value: string): string {
  const parsed = nameSchema.safeParse(value);
  return parsed.success ? parsed.data : reject(parsed.error.issues[0]?.message ?? "Ungültiger Name."); // prettier-ignore
}

async function readReport(id: string): Promise<SavedReport> {
  const snapshot = await reportDoc(id).get();
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
 */
export async function createSavedReport(
  input: SavedReportInput,
  createdByUserId: string,
): Promise<SavedReport> {
  const parsed = savedReportInputSchema.safeParse(input);
  if (!parsed.success) {
    reject(parsed.error.issues[0]?.message ?? "Dieser Bericht lässt sich nicht speichern.");
  }

  const reference = adminDb.collection(COLLECTIONS.savedReports).doc();
  const data = { ...parsed.data, createdByUserId };
  await reference.set(data);

  return { id: reference.id, ...data };
}

/** Renaming is edited in place in the tag, and touches nothing but the name (US-13). */
export async function renameSavedReport(id: string, name: string): Promise<SavedReport> {
  const parsed = parseName(name);
  const current = await readReport(id);

  await reportDoc(id).update({ name: parsed });
  return { ...current, name: parsed };
}

/** The counterpart: what a report holds gives way to the report on screen, its name kept (US-13). */
export async function updateSavedReportSelection(
  id: string,
  selection: ReportSelection,
): Promise<SavedReport> {
  const parsed = savedReportSelectionSchema.safeParse(selection);
  if (!parsed.success) {
    reject(parsed.error.issues[0]?.message ?? "Dieser Bericht lässt sich nicht speichern.");
  }

  const current = await readReport(id);

  await reportDoc(id).update(parsed.data);
  return { ...current, ...parsed.data };
}

export async function deleteSavedReport(id: string): Promise<void> {
  await readReport(id);
  await reportDoc(id).delete();
}
