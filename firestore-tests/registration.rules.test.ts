/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "sportsweek-registration-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());

const TEACHER_UID = "uid-of-lehrperson";
const STUDENT_UID = "uid-of-schuelerin";
const OTHER_STUDENT_UID = "uid-of-schueler";
/** Signed in, but has not registered yet — which is where every student starts. */
const NEWCOMER_UID = "uid-of-neu";

const signInAs = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@htldornbirn.at` }).firestore();

const teacher = () => signInAs(TEACHER_UID);
const student = () => signInAs(STUDENT_UID);
const otherStudent = () => signInAs(OTHER_STUDENT_UID);
const anonymous = () => testEnv.unauthenticatedContext().firestore();

/** Beneath the event series it belongs to, named after the student it belongs to (US-26). */
const REGISTRATIONS = "eventSeries/eventSeries1/registrations";
const OTHER_SERIES = "eventSeries/eventSeries2/registrations";

async function seed(collection: string, id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collection).doc(id).set(data);
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // The teacher whose reads these tests are about: planning a series is what reads a
    // registration, and reporting on it is what reads a saved report (US-2).
    await db
      .collection("users")
      .doc(TEACHER_UID)
      .set({
        accountType: "teacher",
        permissions: ["editRegistrations", "editAssignments", "editReports"],
      });
    await db.collection("users").doc(STUDENT_UID).set({ accountType: "student" });
    await db.collection("users").doc(OTHER_STUDENT_UID).set({ accountType: "student" });
    await db.collection("users").doc(NEWCOMER_UID).set({ accountType: "student" });
  });

  await seed(REGISTRATIONS, STUDENT_UID, {
    studentUid: STUDENT_UID,
    firstName: "Erika",
    lastName: "Musterfrau",
    email: "erika.musterfrau@student.htldornbirn.at",
    isAttendingSportsWeek: true,
    class: "5AHIF",
    emergencyContact: { firstName: "Maria", lastName: "Muster", relationship: "mother" },
    rentedEquipment: ["Helm"],
  });
  await seed(REGISTRATIONS, OTHER_STUDENT_UID, {
    studentUid: OTHER_STUDENT_UID,
    firstName: "Max",
    lastName: "Mustermann",
    email: "max.mustermann@student.htldornbirn.at",
    isAttendingSportsWeek: true,
    class: "5AHIF",
  });
});

/**
 * A student's own record is theirs to read and no other student's. Ownership is the document's
 * own name, so the rule needs nothing from `resource` — which is what lets a student read one
 * that does not exist yet (US-26). It carries everything it needs: the emergency contact and
 * the rented equipment are fields of it, so there is no child document whose ownership would
 * have to be worked out separately.
 *
 * A teacher reads the whole subcollection, which is what the assignment board (US-12) and the
 * report (US-13) are: a view of every registration in one event series at once.
 *
 * Writes are closed for the reason they are everywhere else: a save carries invariants rules
 * cannot run a query for — every answer has to be one the series still offers (US-27),
 * answering "no" gives up the event assignment (US-12), and the event series'
 * `hasRegistrations` mirror follows it (US-4).
 */
describe("/eventSeries/{id}/registrations", () => {
  it("lets a student read their own record", async () => {
    await assertSucceeds(student().collection(REGISTRATIONS).doc(STUDENT_UID).get());
  });

  /**
   * Where every student starts. The rule owns the document by its name rather than by a field
   * only an existing document would have, so this is a permitted read of nothing — which is
   * why the form reads the id it derives rather than querying for it.
   */
  it("lets a student who has no record yet read the id they would have", async () => {
    const newcomer = signInAs(NEWCOMER_UID);

    await assertSucceeds(newcomer.collection(REGISTRATIONS).doc(NEWCOMER_UID).get());
  });

  /**
   * The whole subcollection, because a teacher plans across it: the assignment board counts
   * every class and every event of the series (US-12) and the report lists every student
   * (US-13). Both watch it live, so the tables follow an assignment the moment it is stored.
   */
  it("lets a teacher query every record, which is what the assignment board subscribes to", async () => {
    await assertSucceeds(teacher().collection(REGISTRATIONS).get());
  });

  it("lets a teacher read a single record", async () => {
    await assertSucceeds(teacher().collection(REGISTRATIONS).doc(OTHER_STUDENT_UID).get());
  });

  /** Being a teacher opens nothing on its own: each permission is granted deliberately (US-2). */
  it("denies a teacher holding no permission", async () => {
    await seed("users", TEACHER_UID, { accountType: "teacher", permissions: [] });

    await assertFails(teacher().collection(REGISTRATIONS).get());
    await assertFails(teacher().collection(REGISTRATIONS).doc(OTHER_STUDENT_UID).get());
  });

  it("denies a teacher whose only permission is about lists rather than people", async () => {
    await seed("users", TEACHER_UID, { accountType: "teacher", permissions: ["editMasterData"] });

    await assertFails(teacher().collection(REGISTRATIONS).get());
  });

  /** Four permissions read a registration, and each of them alone is enough. */
  it.each(["editRegistrations", "editAssignments", "viewReports", "editReports"])(
    "lets a teacher holding only %s read them",
    async (permission) => {
      await seed("users", TEACHER_UID, { accountType: "teacher", permissions: [permission] });

      await assertSucceeds(teacher().collection(REGISTRATIONS).get());
    },
  );

  it("denies a student reading another student's record", async () => {
    await assertFails(student().collection(REGISTRATIONS).doc(OTHER_STUDENT_UID).get());
  });

  it("denies a student querying the whole subcollection", async () => {
    await assertFails(student().collection(REGISTRATIONS).get());
  });

  it("denies an unauthenticated read", async () => {
    await assertFails(anonymous().collection(REGISTRATIONS).doc(STUDENT_UID).get());
  });

  it("denies a student writing their own record, so the save keeps going through the handler", async () => {
    await assertFails(
      student().collection(REGISTRATIONS).doc(STUDENT_UID).update({ class: "5BHIF" }),
    );
  });

  it("denies a student creating a record in an event series of their choosing", async () => {
    await assertFails(
      student()
        .collection(OTHER_SERIES)
        .doc(STUDENT_UID)
        .set({ studentUid: STUDENT_UID, isAttendingSportsWeek: true }),
    );
  });

  it("denies a student assigning themselves to an event", async () => {
    await assertFails(
      student().collection(REGISTRATIONS).doc(STUDENT_UID).update({ event: "Woche 1" }),
    );
  });

  it("denies a student deleting their own record", async () => {
    await assertFails(student().collection(REGISTRATIONS).doc(STUDENT_UID).delete());
  });

  it("denies a teacher writing a record", async () => {
    await assertFails(
      teacher().collection(REGISTRATIONS).doc(STUDENT_UID).update({ class: "5BHIF" }),
    );
  });

  /**
   * A teacher may remove one (US-28), but through the handler: the mirror `hasRegistrations` is
   * recomputed in the same transaction, which a rule cannot do.
   */
  it("denies a teacher deleting a record directly", async () => {
    await assertFails(teacher().collection(REGISTRATIONS).doc(STUDENT_UID).delete());
  });
});

/**
 * Saved reports are shared among teachers (US-13) and are no business of a student's. They sit
 * beneath the series whose lists they filter on, which is what lets that be said: a rule grants
 * a whole document or none of it, and a student reads the event series document to be asked its
 * questions (US-11), so a field on it would have handed them every report of every series.
 */
describe("/eventSeries/{id}/savedReports", () => {
  const SAVED_REPORTS = "eventSeries/eventSeries1/savedReports";
  const report = {
    createdByUserId: TEACHER_UID,
    name: "5AHIF",
    filter: {
      name: "",
      tags: { class: ["5AHIF"], gender: [], program: [], skillLevel: [], attendance: [] },
    },
    fields: ["class"],
  };

  beforeEach(async () => await seed(SAVED_REPORTS, "report1", report));

  it("lets a teacher read a report saved by another teacher, since they are shared", async () => {
    await assertSucceeds(teacher().collection(SAVED_REPORTS).doc("report1").get());
  });

  it("lets a teacher query them, which is what the report's tag row does", async () => {
    await assertSucceeds(teacher().collection(SAVED_REPORTS).get());
  });

  /** A saved report is a report: whoever may not open one may not see what was saved of it. */
  it("denies a teacher who may neither view nor edit reports", async () => {
    await seed("users", TEACHER_UID, {
      accountType: "teacher",
      permissions: ["editRegistrations", "editAssignments", "editMasterData"],
    });

    await assertFails(teacher().collection(SAVED_REPORTS).get());
    await assertFails(teacher().collection(SAVED_REPORTS).doc("report1").get());
  });

  it.each(["viewReports", "editReports"])(
    "lets a teacher holding only %s read them",
    async (permission) => {
      await seed("users", TEACHER_UID, { accountType: "teacher", permissions: [permission] });

      await assertSucceeds(teacher().collection(SAVED_REPORTS).get());
    },
  );

  it("denies a student reading them", async () => {
    await assertFails(student().collection(SAVED_REPORTS).doc("report1").get());
  });

  it("denies a student querying them, which reading the series they registered for does not", async () => {
    await assertFails(student().collection(SAVED_REPORTS).get());
  });

  it("denies an unauthenticated read", async () => {
    await assertFails(anonymous().collection(SAVED_REPORTS).doc("report1").get());
  });

  it("denies a teacher writing one", async () => {
    await assertFails(
      teacher()
        .collection(SAVED_REPORTS)
        .doc("report2")
        .set({ ...report, name: "5BHIF" }),
    );
  });

  it("denies a teacher deleting one", async () => {
    await assertFails(teacher().collection(SAVED_REPORTS).doc("report1").delete());
  });
});

/** Cross-checks that the record another student owns is genuinely reachable by its owner. */
describe("ownership is the document's own name", () => {
  it("lets the other student read the record named after them", async () => {
    await assertSucceeds(otherStudent().collection(REGISTRATIONS).doc(OTHER_STUDENT_UID).get());
  });
});
