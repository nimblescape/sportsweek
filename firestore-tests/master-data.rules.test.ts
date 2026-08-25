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
    projectId: "sportsweek-master-data-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());

/**
 * `/users` is keyed by UPN, not by the Firebase uid, so the two are kept distinct here —
 * reusing one value for both would let a broken rule pass in tests and fail in production.
 */
const TEACHER_UPN = "lehrperson@htldornbirn.at";
const STUDENT_UPN = "schuelerin@student.htldornbirn.at";

const signInAs = (upn: string) =>
  testEnv.authenticatedContext(`uid-of-${upn}`, { email: upn }).firestore();

const teacher = () => signInAs(TEACHER_UPN);
const student = () => signInAs(STUDENT_UPN);
const anonymous = () => testEnv.unauthenticatedContext().firestore();

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection("users").doc(TEACHER_UPN).set({ role: "teacher" });
    await db.collection("users").doc(STUDENT_UPN).set({ role: "student" });
  });
});

async function seed(collection: string, id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collection).doc(id).set(data);
  });
}

/**
 * Every teacher-maintained collection follows one model: anyone signed in may read, because
 * student master data selects from these lists, and nobody may write from the client.
 *
 * Writes are closed because the invariants these collections carry cannot be expressed in
 * rules at all — rules can `get()` a known path but cannot run a query, so "is this name
 * already taken?" (US-4 to US-10), "is exactly one season active?" (US-4) and "is this item
 * still in use?" (US-5 to US-10) are all unreachable here. They are enforced in transactions
 * in the Route Handlers instead, and leaving a second, unchecked way in would make those
 * guarantees worthless.
 */
const READABLE_COLLECTIONS: [string, Record<string, unknown>][] = [
  ["programs", { name: "Ski" }],
  ["classOptions", { name: "5AHIF" }],
  ["skillLevels", { name: "Fortgeschritten" }],
  ["busPickupPoints", { name: "Dornbirn" }],
  ["foodOptions", { name: "Vegetarisch" }],
  ["seasonPassOptions", { name: "Montafon Card" }],
  ["requiredEquipmentItems", { programId: "p1", name: "Helm" }],
  ["seasons", { name: "Winter 2026", isActive: false, isArchived: false }],
  ["events", { seasonId: "s1", name: "Montafon" }],
];

describe.each(READABLE_COLLECTIONS)("/%s", (collection, valid) => {
  it("lets a teacher read it", async () => {
    await seed(collection, "item1", valid);

    await assertSucceeds(teacher().collection(collection).doc("item1").get());
  });

  it("lets a student read it, since master data selects from these lists", async () => {
    await seed(collection, "item1", valid);

    await assertSucceeds(student().collection(collection).doc("item1").get());
  });

  it("lets a signed-in user query it, which is what the live list does", async () => {
    await seed(collection, "item1", valid);

    await assertSucceeds(student().collection(collection).get());
  });

  it("denies an unauthenticated read", async () => {
    await seed(collection, "item1", valid);

    await assertFails(anonymous().collection(collection).doc("item1").get());
  });

  it("denies a client create, even by a teacher, so the uniqueness check cannot be bypassed", async () => {
    await assertFails(teacher().collection(collection).doc("new").set(valid));
  });

  it("denies a client update, even by a teacher", async () => {
    await seed(collection, "item1", valid);

    await assertFails(teacher().collection(collection).doc("item1").update({ name: "Anders" }));
  });

  it("denies a client delete, even by a teacher", async () => {
    await seed(collection, "item1", valid);

    await assertFails(teacher().collection(collection).doc("item1").delete());
  });

  it("denies a student writing", async () => {
    await assertFails(student().collection(collection).doc("new").set(valid));
  });

  it("denies an unauthenticated write", async () => {
    await assertFails(anonymous().collection(collection).doc("new").set(valid));
  });
});

describe("invariants that rules cannot express are not left half-guarded", () => {
  it("stops a teacher marking a second season active from the client", async () => {
    await seed("seasons", "a", { name: "Winter 2026", isActive: true, isArchived: false });
    await seed("seasons", "b", { name: "Winter 2027", isActive: false, isArchived: false });

    await assertFails(teacher().collection("seasons").doc("b").update({ isActive: true }));
  });

  it("stops a teacher creating a duplicate season name from the client", async () => {
    await seed("seasons", "a", { name: "Winter 2026", isActive: false, isArchived: false });

    await assertFails(
      teacher()
        .collection("seasons")
        .doc("b")
        .set({ name: "Winter 2026", isActive: false, isArchived: false }),
    );
  });

  it("stops a teacher creating a duplicate event name from the client", async () => {
    await seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await assertFails(
      teacher().collection("events").doc("e2").set({ seasonId: "s1", name: "Montafon" }),
    );
  });
});
