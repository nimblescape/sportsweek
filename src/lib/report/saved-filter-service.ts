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
  savedReportFilterInputSchema,
  savedReportFilterSchema,
  type SavedReportFilter,
  type SavedReportFilterInput,
} from "@/lib/schemas/saved-report-filter";

const nameSchema = savedReportFilterSchema.shape.name;

function filterDoc(id: string) {
  return adminDb.collection(COLLECTIONS.savedReportFilters).doc(id);
}

function reject(message: string): never {
  throw new ServiceError(ErrorCode.ValidationError, message);
}

function parseName(value: string): string {
  const parsed = nameSchema.safeParse(value);
  return parsed.success ? parsed.data : reject(parsed.error.issues[0]?.message ?? "Ungültiger Name."); // prettier-ignore
}

async function readFilter(id: string): Promise<SavedReportFilter> {
  const snapshot = await filterDoc(id).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Filter gibt es nicht.");
  }

  const parsed = savedReportFilterSchema.safeParse({ id, ...snapshot.data() });
  if (!parsed.success) {
    throw new ServiceError(ErrorCode.InternalError, "Dieser Filter ist beschädigt.");
  }
  return parsed.data;
}

/**
 * Saved report filters go through handlers rather than straight from the browser, because the
 * author is the session's and not the request's — the declarative write path stays closed
 * (see firestore.rules). They are shared among all teachers, so who saved one decides nothing
 * about who may use, rename or remove it (US-13).
 */
export async function createSavedFilter(
  input: SavedReportFilterInput,
  createdByUserId: string,
): Promise<SavedReportFilter> {
  const parsed = savedReportFilterInputSchema.safeParse(input);
  if (!parsed.success) {
    reject(parsed.error.issues[0]?.message ?? "Dieser Filter lässt sich nicht speichern.");
  }

  const reference = adminDb.collection(COLLECTIONS.savedReportFilters).doc();
  const data = { ...parsed.data, createdByUserId };
  await reference.set(data);

  return { id: reference.id, ...data };
}

/** Renaming is edited in place in the dropdown, and touches nothing but the name (US-13). */
export async function renameSavedFilter(id: string, name: string): Promise<SavedReportFilter> {
  const parsed = parseName(name);
  const current = await readFilter(id);

  await filterDoc(id).update({ name: parsed });
  return { ...current, name: parsed };
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await readFilter(id);
  await filterDoc(id).delete();
}
