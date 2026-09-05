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
import {
  MASTER_DATA_CATEGORIES,
  questionsAsked,
  type EventSeriesListField,
} from "@/lib/master-data/categories";
import { resolveEventLists } from "@/lib/master-data/resolution";
import {
  registrationInputSchema,
  registrationSchema,
  type Registration,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import { userSchema } from "@/lib/schemas/user";
import {
  ARCHIVED_IS_READ_ONLY_HINT,
  NO_SUCH_EVENT_SERIES,
} from "@/lib/event-series/event-series-state";
import { isRegistrationIncomplete } from "./completeness";
import {
  ANSWER_NO_LONGER_OFFERED_HINT,
  EMPTY_REGISTRATION,
  registrationPath,
  REGISTRATION_NOT_OPEN_HINT,
} from "./registration";

/**
 * The series the student is writing into. It is named rather than searched for, because a student
 * may hold registrations in several (Q7) and only they know which form they are looking at; what
 * they cannot do is name one they never joined, since a save with no stored class is refused.
 */
export type RegistrationTarget = {
  studentUid: string;
  eventSeriesId: string;
};

/**
 * The series as it has to stand for a student to write into it (US-19).
 *
 * One flag rather than two: archiving closes, and the server refuses to open an archived series,
 * so `isOpenToStudents` already excludes it. A series that has since been
 * closed, archived or deleted, and one that was never named by a link the student holds, are all
 * answered with the same sentence — from where the student stands they are the same thing.
 */
async function requireOpenSeries(
  transaction: Transaction,
  eventSeriesId: string,
): Promise<EventSeries> {
  const stored = await transaction.get(
    adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId),
  );

  const series = stored.exists
    ? eventSeriesSchema.safeParse({ id: stored.id, ...stored.data() })
    : null;

  if (!series?.success || !series.data.isOpenToStudents) {
    throw new ServiceError(ErrorCode.Conflict, REGISTRATION_NOT_OPEN_HINT);
  }
  return series.data;
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
 * Every list value a registration carries has to be one the event resolves to (US-33, US-35).
 *
 * Checked against the series read inside the save's own transaction, which is the other half of
 * closing the race the in-use guard opens: a teacher removing an option writes the series
 * document, so a save that read the older one conflicts, retries, and is refused here rather
 * than storing a value nothing offers. Without a cascade there is nothing to repair it later.
 */
function assertAnswersAreOffered(
  lists: Pick<EventSeries, EventSeriesListField>,
  answers: RegistrationInput & Pick<Registration, "class">,
): void {
  for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
    const answer = answers[category.usage.field as keyof typeof answers];
    if (typeof answer !== "string" || answer === "") continue;

    const list = lists[category.field];
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
async function identityOf(studentUid: string) {
  const stored = await adminDb.collection(COLLECTIONS.users).doc(studentUid).get();
  const user = userSchema.safeParse({ id: studentUid, ...stored.data() });

  if (!user.success) {
    throw new ServiceError(ErrorCode.NotFound, "Dieses Benutzerkonto gibt es nicht.");
  }
  return {
    studentUid,
    firstName: user.data.firstName,
    lastName: user.data.lastName,
    email: user.data.email,
  };
}

/**
 * Writes the student's registration for one event series, whole.
 *
 * A student cannot write this collection at all (see firestore.rules), and this is why: the
 * class comes from the link they joined through rather than being answered (US-23), the name is
 * copied here rather than typed, answering "no" gives up the event assignment a teacher made
 * (US-11, US-12), and the event series' `hasRegistrations` mirror has to follow along so the
 * teacher's list can decide about archiving without reading records it may not read (US-19).
 *
 * It is one transaction rather than a batch because the answers are validated against the series
 * as it stands: reading that document inside the transaction is what makes a teacher's
 * concurrent list edit conflict rather than slip past (US-27).
 */
export async function saveRegistration(
  target: RegistrationTarget,
  input: RegistrationInput,
): Promise<Registration> {
  const fields = parseInput(input);
  const identity = await identityOf(target.studentUid);

  return adminDb.runTransaction(async (transaction) => {
    const eventSeries = await requireOpenSeries(transaction, target.eventSeriesId);

    // The series is the path and the student's uid is the id, so one registration per student
    // per series holds by construction rather than by a check (US-26).
    const reference = adminDb.collection(registrationPath(eventSeries.id)).doc(identity.studentUid);
    const stored = await transaction.get(reference);

    // Nothing already enrolling them: following the link is what joins a student and writes the
    // registration (US-23), so without one this is somebody who has arrived at the wrong series.
    const studentClass = (stored.data()?.class as string) ?? null;
    if (studentClass === null) {
      throw new ServiceError(ErrorCode.Conflict, REGISTRATION_NOT_OPEN_HINT);
    }

    // The teacher owns the assignment, so a save carries the stored one forward — unless the
    // student has just said they are not coming, which unassigns them (US-11). Saying nothing
    // is not saying no, so an unanswered form leaves the assignment where it is.
    const event =
      fields.isAttendingSportsWeek === false ? null : ((stored.data()?.event as string) ?? null);

    // What the student's own event offers, falling back to the series' (US-33, US-35) — the one
    // resolution both the check below and the completeness it feeds are asked for.
    const lists = resolveEventLists(eventSeries, event);

    assertAnswersAreOffered(lists, { ...fields, class: studentClass });

    const data = {
      ...identity,
      class: studentClass,
      event,
      // Recomputed here rather than trusted from the client: it is what the report marks a
      // student by (US-13), so it has to follow the answers actually stored.
      isIncomplete: isRegistrationIncomplete(fields, questionsAsked(lists)),
      ...fields,
    };
    const record = registrationSchema.parse({ id: identity.studentUid, ...data });

    transaction.set(reference, data);
    if (!eventSeries.hasRegistrations) {
      transaction.update(adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
        hasRegistrations: true,
      });
    }

    return record;
  });
}

export const NO_SUCH_REGISTRATION = "Diese Registrierung gibt es nicht.";

/**
 * Joins a student to an event series, which is the whole of what following an invitation link
 * does (US-23). The registration exists from that moment, unanswered, so what a student holds is
 * a fact in the data rather than a token they are carrying — and signing in again finds it by
 * looking, whichever way they arrived.
 *
 * Following the same link twice is one joining: an existing registration keeps every answer.
 * What a newer link does change is the class, which is the one way it moves (Q20).
 */
export async function joinEventSeries(
  eventSeriesId: string,
  studentUid: string,
  className: string,
): Promise<void> {
  const identity = await identityOf(studentUid);

  await adminDb.runTransaction(async (transaction) => {
    const eventSeries = await requireOpenSeries(transaction, eventSeriesId);

    const reference = adminDb.collection(registrationPath(eventSeries.id)).doc(identity.studentUid);
    const stored = await transaction.get(reference);

    if (stored.exists) {
      transaction.update(reference, { class: className });
    } else {
      transaction.set(reference, {
        ...identity,
        class: className,
        event: null,
        isIncomplete: isRegistrationIncomplete(EMPTY_REGISTRATION, questionsAsked(eventSeries)),
        ...EMPTY_REGISTRATION,
      });
    }

    if (!eventSeries.hasRegistrations) {
      transaction.update(adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
        hasRegistrations: true,
      });
    }
  });
}

/**
 * Removes one registration and everything the student answered with it (US-28).
 *
 * A teacher's doing, never a student's: a student who is not coming answers "no" (US-11), which
 * keeps them in the figures. Closing governs students only, so a closed series still allows it;
 * an archived one is read-only and does not.
 *
 * One transaction, because `hasRegistrations` is recomputed from what is left — the first time
 * that mirror has ever had to go back down (Q5), and it is what US-19's archive and delete
 * controls read.
 */
export async function deleteRegistration(eventSeriesId: string, studentUid: string): Promise<void> {
  const row = adminDb.collection(registrationPath(eventSeriesId));
  const seriesRef = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);

  await adminDb.runTransaction(async (transaction) => {
    const series = await transaction.get(seriesRef);
    if (!series.exists) throw new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);
    if (series.data()?.isArchived === true) {
      throw new ServiceError(ErrorCode.Conflict, ARCHIVED_IS_READ_ONLY_HINT);
    }

    const reference = row.doc(studentUid);
    const stored = await transaction.get(reference);
    if (!stored.exists) throw new ServiceError(ErrorCode.NotFound, NO_SUCH_REGISTRATION);

    // Read inside the transaction, so a registration arriving while this one is removed keeps the
    // mirror true rather than being counted away by a stale total.
    const remaining = await transaction.get(row);

    transaction.delete(reference);
    if (remaining.size <= 1) transaction.update(seriesRef, { hasRegistrations: false });
  });
}
