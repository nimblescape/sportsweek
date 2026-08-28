/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import { MASTER_DATA_CATEGORIES } from "@/lib/master-data/categories";
import {
  registrationInputSchema,
  registrationSchema,
  type Registration,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { userSchema } from "@/lib/schemas/user";
import { isRegistrationIncomplete } from "./completeness";
import {
  ANSWER_NO_LONGER_OFFERED_HINT,
  registrationPath,
  REGISTRATION_NOT_OPEN_HINT,
} from "./registration";

/**
 * Registering needs two things a teacher sets up, and neither is one the student can do without:
 * the event series the record belongs to (US-4) and a class to pick from, which is the one field asked
 * of every student whether they attend or not (US-6, US-11). A half-finished setup is refused
 * with the same answer as no event series at all — from where the student stands they are the same
 * thing, and the client shows exactly this message rather than a form it cannot fill in.
 */
async function requireOpenRegistration(transaction: Transaction): Promise<EventSeries> {
  const snapshot = await transaction.get(
    adminDb.collection(COLLECTIONS.eventSeries).where("isActive", "==", true),
  );

  const active = activeEventSeriesOf(
    snapshot.docs.map((eventSeries) =>
      eventSeriesSchema.parse({ id: eventSeries.id, ...eventSeries.data() }),
    ),
  );

  const classes = active?.classOptions ?? [];

  if (!active || classes.length === 0) {
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
 * Every list value a registration carries has to be one the event series currently offers.
 *
 * Checked against the series read inside the save's own transaction, which is the other half of
 * closing the race the in-use guard opens: a teacher removing an option writes the series
 * document, so a save that read the older one conflicts, retries, and is refused here rather
 * than storing a value nothing offers. Without a cascade there is nothing to repair it later.
 */
function assertAnswersAreOffered(eventSeries: EventSeries, fields: RegistrationInput): void {
  for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
    const answer = fields[category.usage.field as keyof RegistrationInput];
    if (typeof answer !== "string" || answer === "") continue;

    const list = eventSeries[category.field];
    const offered = list.map((entry) => (typeof entry === "string" ? entry : entry.name));

    // The free-text choice is never a row a teacher keeps, but it is offered alongside a
    // non-empty list (US-9, US-21), so it is a legitimate answer wherever the question is asked.
    const permitted =
      category.usage.field === "foodOption" && offered.length > 0
        ? [...offered, FOOD_OPTION_OTHER]
        : offered;

    if (!permitted.includes(answer)) {
      throw new ServiceError(ErrorCode.Conflict, ANSWER_NO_LONGER_OFFERED_HINT);
    }
  }
}

/**
 * The three fields a reader needs and a student may not give (US-26). They are read from the
 * user record rather than sent, and that record is corrected from the directory at every login
 * (US-1) — which is what keeps this copy from being a snapshot that drifts.
 */
async function identityOf(studentUpn: string) {
  const stored = await adminDb.collection(COLLECTIONS.users).doc(studentUpn).get();
  const user = userSchema.safeParse({ id: studentUpn, ...stored.data() });

  if (!user.success) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Benutzerkonto gibt es nicht.");
  }
  return {
    studentUpn,
    firstName: user.data.firstName,
    lastName: user.data.lastName,
    email: user.data.email,
  };
}

/**
 * Writes the student's registration for the active event series, whole.
 *
 * A student cannot write this collection at all (see firestore.rules), and this is why: the
 * event series is resolved here rather than sent, the name is copied here rather than typed,
 * answering "no" gives up the event assignment a teacher made (US-11, US-12), and the event
 * series' `hasRegistrations` mirror has to follow along so the teacher's list can decide about
 * archiving without reading records it may not read (US-4).
 *
 * It is one transaction rather than a batch because the answers are validated against the series
 * as it stands: reading that document inside the transaction is what makes a teacher's
 * concurrent list edit conflict rather than slip past (US-27).
 */
export async function saveRegistration(
  studentUpn: string,
  input: RegistrationInput,
): Promise<Registration> {
  const fields = parseInput(input);
  const identity = await identityOf(studentUpn);

  return adminDb.runTransaction(async (transaction) => {
    const eventSeries = await requireOpenRegistration(transaction);

    // The series is the path and the UPN is the id, so one registration per student per series
    // holds by construction rather than by a check (US-26).
    const reference = adminDb.collection(registrationPath(eventSeries.id)).doc(identity.studentUpn);
    const stored = await transaction.get(reference);

    assertAnswersAreOffered(eventSeries, fields);

    // The teacher owns the assignment, so a save carries the stored one forward — unless the
    // student has just said they are not coming, which unassigns them (US-11).
    const event = fields.isAttendingSportsWeek ? ((stored.data()?.event as string) ?? null) : null;

    const data = {
      ...identity,
      event,
      // Recomputed here rather than trusted from the client: it is what the report marks a
      // student by (US-13), so it has to follow the answers actually stored.
      isIncomplete: isRegistrationIncomplete(fields),
      ...fields,
    };
    const record = registrationSchema.parse({ id: identity.studentUpn, ...data });

    transaction.set(reference, data);
    if (!eventSeries.hasRegistrations) {
      transaction.update(adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
        hasRegistrations: true,
      });
    }

    return record;
  });
}
