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
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import {
  registrationInputSchema,
  registrationSchema,
  type Registration,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { isRegistrationIncomplete } from "./completeness";
import { recordIdFor, REGISTRATION_NOT_OPEN_HINT } from "./registration";

/**
 * Registering needs two things a teacher sets up, and neither is one the student can do without:
 * the event series the record belongs to (US-4) and a class to pick from, which is the one field asked
 * of every student whether they attend or not (US-6, US-11). A half-finished setup is refused
 * with the same answer as no event series at all — from where the student stands they are the same
 * thing, and the client shows exactly this message rather than a form it cannot fill in.
 */
async function requireOpenRegistration(): Promise<EventSeries> {
  const snapshot = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isActive", "==", true)
    .get();

  const active = activeEventSeriesOf(
    snapshot.docs.map((eventSeries) =>
      eventSeriesSchema.parse({ id: eventSeries.id, ...eventSeries.data() }),
    ),
  );

  const classes = await adminDb.collection(COLLECTIONS.classOptions).limit(1).get();

  if (!active || classes.empty) {
    throw new ServiceError(ErrorCode.Conflict, REGISTRATION_NOT_OPEN_HINT);
  }
  return active;
}

function parseInput(input: RegistrationInput): RegistrationInput {
  const parsed = registrationInputSchema.safeParse(input);
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
 * Writes the student's registration for the active event series, whole.
 *
 * A student cannot write this collection at all (see firestore.rules), and this is why: the
 * event series is resolved here rather than sent, answering "no" gives up the event assignment a
 * teacher made (US-11, US-12), and the event series' `hasRegistrations` mirror has to follow along so
 * the teacher's list can decide about archiving without reading records it may not read (US-4).
 * The record and that mirror go in one batch, so neither can land without the other.
 */
export async function saveRegistration(
  userId: string,
  input: RegistrationInput,
): Promise<Registration> {
  const fields = parseInput(input);
  const eventSeries = await requireOpenRegistration();

  const id = recordIdFor(eventSeries.id, userId);
  const reference = adminDb.collection(COLLECTIONS.registrations).doc(id);
  const stored = await reference.get();

  // The teacher owns the assignment, so a save carries the stored one forward — unless the
  // student has just said they are not coming, which unassigns them (US-11).
  const eventId = fields.isAttendingSportsWeek
    ? ((stored.data()?.eventId as string) ?? null)
    : null;

  const data = {
    userId,
    eventSeriesId: eventSeries.id,
    eventId,
    // Recomputed here rather than trusted from the client: it is what the report marks a
    // student by (US-13), so it has to follow the answers actually stored.
    isIncomplete: isRegistrationIncomplete(fields),
    ...fields,
  };
  const record = registrationSchema.parse({ id, ...data });

  const batch = adminDb.batch().set(reference, data);
  if (!eventSeries.hasRegistrations) {
    batch.update(adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
      hasRegistrations: true,
    });
  }
  await batch.commit();

  return record;
}
