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
    projectId: "sportsweek-student-master-data-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());

const TEACHER_UPN = "lehrperson@htldornbirn.at";
const STUDENT_UPN = "schuelerin@student.htldornbirn.at";
const OTHER_STUDENT_UPN = "schueler@student.htldornbirn.at";

const signInAs = (upn: string) =>
  testEnv.authenticatedContext(`uid-of-${upn}`, { email: upn }).firestore();

const teacher = () => signInAs(TEACHER_UPN);
const student = () => signInAs(STUDENT_UPN);
const otherStudent = () => signInAs(OTHER_STUDENT_UPN);
const anonymous = () => testEnv.unauthenticatedContext().firestore();

const OWN_RECORD = "season1__schuelerin@student.htldornbirn.at";
const FOREIGN_RECORD = "season1__schueler@student.htldornbirn.at";

async function seed(collection: string, id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collection).doc(id).set(data);
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection("users").doc(TEACHER_UPN).set({ role: "teacher" });
    await db.collection("users").doc(STUDENT_UPN).set({ role: "student" });
    await db.collection("users").doc(OTHER_STUDENT_UPN).set({ role: "student" });
  });

  await seed("studentMasterData", OWN_RECORD, {
    userId: STUDENT_UPN,
    seasonId: "season1",
    isAttendingSportsWeek: true,
    class: "5AHIF",
  });
  await seed("studentMasterData", FOREIGN_RECORD, {
    userId: OTHER_STUDENT_UPN,
    seasonId: "season1",
    isAttendingSportsWeek: true,
    class: "5AHIF",
  });
});

/**
 * A student's own record is theirs to read and nobody else's. Writes are closed for the same
 * reason as everywhere else: the invariants a save carries — the record belongs to *the* active
 * season, switching to "no" gives up the event assignment (US-11, US-12), and the season's
 * `hasStudentData` mirror follows along (US-4) — all need queries, which rules cannot run.
 */
describe("/studentMasterData", () => {
  it("lets a student read their own record", async () => {
    await assertSucceeds(student().collection("studentMasterData").doc(OWN_RECORD).get());
  });

  it("lets a student query for their own record, which is what the form subscribes to", async () => {
    await assertSucceeds(
      student().collection("studentMasterData").where("userId", "==", STUDENT_UPN).get(),
    );
  });

  it("denies a student reading another student's record", async () => {
    await assertFails(student().collection("studentMasterData").doc(FOREIGN_RECORD).get());
  });

  it("denies a student querying the whole collection", async () => {
    await assertFails(student().collection("studentMasterData").get());
  });

  it("denies an unauthenticated read", async () => {
    await assertFails(anonymous().collection("studentMasterData").doc(OWN_RECORD).get());
  });

  it("denies a student writing their own record, so the save keeps going through the handler", async () => {
    await assertFails(
      student().collection("studentMasterData").doc(OWN_RECORD).update({ class: "5BHIF" }),
    );
  });

  it("denies a student creating a record for a season of their choosing", async () => {
    await assertFails(
      student()
        .collection("studentMasterData")
        .doc("season2__schuelerin@student.htldornbirn.at")
        .set({ userId: STUDENT_UPN, seasonId: "season2", isAttendingSportsWeek: true }),
    );
  });

  it("denies a student assigning themselves to an event", async () => {
    await assertFails(
      student().collection("studentMasterData").doc(OWN_RECORD).update({ eventId: "event1" }),
    );
  });

  it("denies a student deleting their own record", async () => {
    await assertFails(student().collection("studentMasterData").doc(OWN_RECORD).delete());
  });

  it("denies a teacher writing a record", async () => {
    await assertFails(
      teacher().collection("studentMasterData").doc(OWN_RECORD).update({ class: "5BHIF" }),
    );
  });
});

/**
 * The child records carry no owner of their own — the record they hang off does, which is why
 * ownership is read from the parent rather than duplicated onto every child.
 */
describe.each([
  ["emergencyContacts", { firstName: "Maria", lastName: "Muster", relationship: "mother" }],
  ["equipmentRentalItems", { itemName: "Helm" }],
])("/%s", (collection, fields) => {
  beforeEach(async () => {
    await seed(collection, "own1", { ...fields, studentMasterDataId: OWN_RECORD });
    await seed(collection, "foreign1", { ...fields, studentMasterDataId: FOREIGN_RECORD });
  });

  it("lets a student read a child of their own record", async () => {
    await assertSucceeds(student().collection(collection).doc("own1").get());
  });

  it("lets a student query the children of their own record", async () => {
    await assertSucceeds(
      student().collection(collection).where("studentMasterDataId", "==", OWN_RECORD).get(),
    );
  });

  it("denies a student reading a child of another student's record", async () => {
    await assertFails(student().collection(collection).doc("foreign1").get());
  });

  it("denies a student reading a child whose parent does not exist", async () => {
    await seed(collection, "orphan", { ...fields, studentMasterDataId: "season1__nobody" });

    await assertFails(student().collection(collection).doc("orphan").get());
  });

  it("denies an unauthenticated read", async () => {
    await assertFails(anonymous().collection(collection).doc("own1").get());
  });

  it("denies a student writing a child of their own record", async () => {
    await assertFails(student().collection(collection).doc("own1").update(fields));
  });

  it("denies a student creating a child of their own record", async () => {
    await assertFails(
      student()
        .collection(collection)
        .doc("own2")
        .set({ ...fields, studentMasterDataId: OWN_RECORD }),
    );
  });

  it("denies a student deleting a child of their own record", async () => {
    await assertFails(student().collection(collection).doc("own1").delete());
  });

  it("denies a teacher writing a child", async () => {
    await assertFails(teacher().collection(collection).doc("own1").update(fields));
  });
});

/** Saved report filters are shared among teachers (US-13) and are no business of a student's. */
describe("/savedReportFilters", () => {
  const filter = { createdByUserId: TEACHER_UPN, name: "5AHIF", classFilter: ["5AHIF"] };

  beforeEach(async () => await seed("savedReportFilters", "filter1", filter));

  it("lets a teacher read a filter saved by another teacher, since they are shared", async () => {
    await assertSucceeds(teacher().collection("savedReportFilters").doc("filter1").get());
  });

  it("lets a teacher query them, which is what the report's dropdown does", async () => {
    await assertSucceeds(teacher().collection("savedReportFilters").get());
  });

  it("denies a student reading them", async () => {
    await assertFails(student().collection("savedReportFilters").doc("filter1").get());
  });

  it("denies an unauthenticated read", async () => {
    await assertFails(anonymous().collection("savedReportFilters").doc("filter1").get());
  });

  it("denies a teacher writing one", async () => {
    await assertFails(
      teacher()
        .collection("savedReportFilters")
        .doc("filter2")
        .set({ ...filter, name: "5BHIF" }),
    );
  });

  it("denies a teacher deleting one", async () => {
    await assertFails(teacher().collection("savedReportFilters").doc("filter1").delete());
  });
});

/** Cross-checks that the record another student owns is genuinely reachable by its owner. */
describe("ownership is read from the record, not from the id", () => {
  it("lets the other student read the record that names them", async () => {
    await assertSucceeds(otherStudent().collection("studentMasterData").doc(FOREIGN_RECORD).get());
  });
});
