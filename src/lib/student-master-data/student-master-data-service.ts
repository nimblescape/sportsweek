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
import { seasonSchema, type Season } from "@/lib/schemas/season";
import {
  studentMasterDataInputSchema,
  studentMasterDataSchema,
  type StudentMasterData,
  type StudentMasterDataInput,
} from "@/lib/schemas/student-master-data";
import { activeSeasonOf } from "@/lib/seasons/season-state";
import { recordIdFor, REGISTRATION_NOT_OPEN_HINT } from "./registration";

/**
 * Registering needs two things a teacher sets up, and neither is one the student can do without:
 * the season the record belongs to (US-4) and a class to pick from, which is the one field asked
 * of every student whether they attend or not (US-6, US-11). A half-finished setup is refused
 * with the same answer as no season at all — from where the student stands they are the same
 * thing, and the client shows exactly this message rather than a form it cannot fill in.
 */
async function requireOpenRegistration(): Promise<Season> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.seasons)
    .where("isActive", "==", true)
    .get();

  const active = activeSeasonOf(
    snapshot.docs.map((season) => seasonSchema.parse({ id: season.id, ...season.data() })),
  );

  const classes = await adminDb.collection(COLLECTIONS.classOptions).limit(1).get();

  if (!active || classes.empty) {
    throw new ServiceError(ErrorCode.Conflict, REGISTRATION_NOT_OPEN_HINT);
  }
  return active;
}

function parseInput(input: StudentMasterDataInput): StudentMasterDataInput {
  const parsed = studentMasterDataInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      parsed.error.issues[0]?.message ?? "Die Eingabe ist ungültig.",
      parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return parsed.data;
}

/**
 * Writes the student's registration for the active season, whole.
 *
 * A student cannot write this collection at all (see firestore.rules), and this is why: the
 * season is resolved here rather than sent, answering "no" gives up the event assignment a
 * teacher made (US-11, US-12), and the season's `hasStudentData` mirror has to follow along so
 * the teacher's list can decide about archiving without reading records it may not read (US-4).
 * The record and that mirror go in one batch, so neither can land without the other.
 */
export async function saveStudentMasterData(
  userId: string,
  input: StudentMasterDataInput,
): Promise<StudentMasterData> {
  const fields = parseInput(input);
  const season = await requireOpenRegistration();

  const id = recordIdFor(season.id, userId);
  const reference = adminDb.collection(COLLECTIONS.studentMasterData).doc(id);
  const stored = await reference.get();

  // The teacher owns the assignment, so a save carries the stored one forward — unless the
  // student has just said they are not coming, which unassigns them (US-11).
  const eventId = fields.isAttendingSportsWeek
    ? ((stored.data()?.eventId as string) ?? null)
    : null;

  const data = { userId, seasonId: season.id, eventId, ...fields };
  const record = studentMasterDataSchema.parse({ id, ...data });

  const batch = adminDb.batch().set(reference, data);
  if (!season.hasStudentData) {
    batch.update(adminDb.collection(COLLECTIONS.seasons).doc(season.id), { hasStudentData: true });
  }
  await batch.commit();

  return record;
}
