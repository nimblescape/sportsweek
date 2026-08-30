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
    projectId: "sportsweek-identity-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());

const TEACHER_UPN = "lehrperson@htldornbirn.at";
const STUDENT_UPN = "schuelerin@student.htldornbirn.at";
/** A guest of the tenant, or anyone else holding an account this school did not issue. */
const OUTSIDER_UPN = "outsider@example.com";

/** Entra ID, the school's own directory. */
const ENTRA = "microsoft.com";
/** A token signed with the project's service account, which is what the fake login mints. */
const SERVER = "custom";
/** An e-mail sign-up, which asserts whatever address it was handed. */
const SELF_SERVICE = "password";

type SignInProvider = typeof ENTRA | typeof SERVER | typeof SELF_SERVICE;

const REGISTRATIONS = "eventSeries/eventSeries1/registrations";

function signInAs(upn: string | null, signInProvider: SignInProvider) {
  return testEnv
    .authenticatedContext(`uid-of-${upn ?? "nobody"}`, {
      ...(upn ? { email: upn } : {}),
      firebase: { sign_in_provider: signInProvider, identities: {} },
    })
    .firestore();
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db
      .collection("users")
      .doc(TEACHER_UPN)
      .set({ accountType: "teacher", permissions: ["editRegistrations", "editUsers"] });
    await db.collection("users").doc(STUDENT_UPN).set({ accountType: "student" });
    await db.collection("eventSeries").doc("eventSeries1").set({
      name: "Winter 2026",
      nameKey: "winter 2026",
      isOpenToStudents: true,
      isArchived: false,
    });
    await db
      .collection(REGISTRATIONS)
      .doc(STUDENT_UPN)
      .set({ studentUpn: STUDENT_UPN, firstName: "Erika", lastName: "Musterfrau" });
  });
});

/**
 * Every rule below this line asks who the caller is, and the answer is the token's e-mail
 * address. That makes the question of which provider was allowed to put it there the first
 * one — an e-mail sign-up asserts whatever address it is handed, so a project with that
 * provider switched on would hand a stranger a teacher's reach (US-1, US-3).
 */
describe("only the school's own identity provider is trusted", () => {
  it("denies an e-mail sign-up claiming a teacher's address", async () => {
    const impostor = signInAs(TEACHER_UPN, SELF_SERVICE);

    await assertFails(impostor.collection(REGISTRATIONS).get());
    await assertFails(impostor.collection("users").doc(STUDENT_UPN).get());
    await assertFails(impostor.collection("eventSeries").doc("eventSeries1").get());
  });

  it("denies an e-mail sign-up claiming a student's address", async () => {
    const impostor = signInAs(STUDENT_UPN, SELF_SERVICE);

    await assertFails(impostor.collection(REGISTRATIONS).doc(STUDENT_UPN).get());
    await assertFails(impostor.collection("users").doc(STUDENT_UPN).get());
  });

  it("lets the school's own directory in", async () => {
    const teacher = signInAs(TEACHER_UPN, ENTRA);

    await assertSucceeds(teacher.collection(REGISTRATIONS).get());
    await assertSucceeds(teacher.collection("eventSeries").doc("eventSeries1").get());
  });

  /** The fake login of the test environments goes through a token the server itself signed. */
  it("lets a token this project's own server signed in", async () => {
    const teacher = signInAs(TEACHER_UPN, SERVER);

    await assertSucceeds(teacher.collection(REGISTRATIONS).get());
  });
});

/**
 * The domains the school issues UPNs from are what tells a member from an outsider — the same
 * rule `accountTypeFromUpn` applies when a record is provisioned (US-3). A directory admits
 * guests, and a guest is not somebody this application knows.
 */
describe("only an address the school issued counts as a member", () => {
  it("denies a guest of the tenant reading the event series", async () => {
    const guest = signInAs(OUTSIDER_UPN, ENTRA);

    await assertFails(guest.collection("eventSeries").doc("eventSeries1").get());
    await assertFails(guest.collection("eventSeries").get());
  });

  it("denies a guest of the tenant reading the record they would have", async () => {
    const guest = signInAs(OUTSIDER_UPN, ENTRA);

    await assertFails(guest.collection("users").doc(OUTSIDER_UPN).get());
  });

  it("denies a token carrying no address at all", async () => {
    const nameless = signInAs(null, ENTRA);

    await assertFails(nameless.collection("eventSeries").doc("eventSeries1").get());
  });

  it("lets a teacher and a student of the school read the series they select from", async () => {
    await assertSucceeds(
      signInAs(TEACHER_UPN, ENTRA).collection("eventSeries").doc("eventSeries1").get(),
    );
    await assertSucceeds(
      signInAs(STUDENT_UPN, ENTRA).collection("eventSeries").doc("eventSeries1").get(),
    );
  });
});
