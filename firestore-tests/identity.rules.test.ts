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

/** What provisioning mints once it has found the address to be the school's (US-3). */
function signInWithClaim(upn: string, accountType: "teacher" | "student") {
  return testEnv
    .authenticatedContext(`uid-of-${upn}`, {
      email: upn,
      accountType,
      firebase: { sign_in_provider: ENTRA, identities: {} },
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
 * Membership is not a string test here. `provisionUser` refuses an address off the school's
 * domains before it writes anything, so a record or the `accountType` claim it mints is proof
 * that trusted server code has already asked the question (US-3, US-32). The rules ask for that
 * answer rather than repeating the test, which is what lets the domains be asked of the
 * directory later without touching a rule.
 */
describe("membership is what provisioning established", () => {
  it("admits somebody the claim vouches for, before any record exists", async () => {
    const newcomer = signInWithClaim("neu@htldornbirn.at", "teacher");

    await assertSucceeds(newcomer.collection("eventSeries").doc("eventSeries1").get());
  });

  it("admits somebody whose record was written before their token carried the claim", async () => {
    await assertSucceeds(
      signInAs(TEACHER_UPN, ENTRA).collection("eventSeries").doc("eventSeries1").get(),
    );
  });

  /**
   * The school's own domain is no longer enough on its own. Provisioning is what admits somebody,
   * and until it has run there is neither a claim nor a record to show for it.
   */
  it("denies a school address that provisioning has never seen", async () => {
    const unprovisioned = signInAs("niemand@htldornbirn.at", ENTRA);

    await assertFails(unprovisioned.collection("eventSeries").doc("eventSeries1").get());
    await assertFails(unprovisioned.collection("eventSeries").get());
  });

  /** A claim is minted by the Admin SDK alone, so an account type it never assigned is nothing. */
  it("denies a claim naming an account type that is not one", async () => {
    const forged = testEnv
      .authenticatedContext("uid-of-forger", {
        email: OUTSIDER_UPN,
        accountType: "admin",
        firebase: { sign_in_provider: ENTRA, identities: {} },
      })
      .firestore();

    await assertFails(forged.collection("eventSeries").doc("eventSeries1").get());
  });
});

/**
 * The domains the school issues addresses from are what tells a member from an outsider — the same
 * rule `accountTypeFromEmail` applies when a record is provisioned (US-3). A directory admits
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
