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

// Run via `npm run test:rules` — wraps this in `firebase emulators:exec` so a live
// Firestore emulator is available at the port configured in firebase.json.
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "sportsweek-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedUser(uid: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(uid).set(data);
  });
}

/** Beneath the event series it belongs to, named after the student it belongs to (US-26). */
const REGISTRATIONS = "eventSeries/eventSeries1/registrations";

async function seedRegistration(studentUpn: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(REGISTRATIONS).doc(studentUpn).set({ studentUpn });
  });
}

/**
 * Production keys `/users` by UPN (see provisionUser) while `request.auth.uid` is an opaque
 * Firebase id. Signing in through this helper keeps the two distinct, so a rule that confuses
 * them cannot pass here and fail in production.
 */
const ALICE = "alice@student.htldornbirn.at";
const BOB = "bob@student.htldornbirn.at";
const CAROL = "carol@htldornbirn.at";
const DAVE = "dave@student.htldornbirn.at";
const MALLORY = "mallory@student.htldornbirn.at";

function signInAs(upn: string, claims: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(`uid-of-${upn}`, { email: upn, ...claims }).firestore();
}

const student = (extra: Record<string, unknown> = {}) => ({ accountType: "student", ...extra });
const teacher = (extra: Record<string, unknown> = {}) => ({
  accountType: "teacher",
  permissions: [],
  ...extra,
});
const admin = (extra: Record<string, unknown> = {}) =>
  teacher({ permissions: ["editUsers"], ...extra });

describe("/users/{uid} read access", () => {
  it("denies read access to signed-out users", async () => {
    await seedUser(ALICE, student());
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(db.collection("users").doc(ALICE).get());
  });

  it("allows a user to read their own document", async () => {
    await seedUser(ALICE, student());
    const db = signInAs(ALICE);

    await assertSucceeds(db.collection("users").doc(ALICE).get());
  });

  it("denies a student reading another user's document", async () => {
    await seedUser(ALICE, student());
    await seedUser(BOB, student());
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(BOB).get());
  });

  /**
   * A teacher used to read every user, because the roster joined registrations to them for the
   * student's name. The registration carries that name itself now (US-26), so what is left of
   * that permission belongs to whoever hands the permissions out (US-2).
   */
  it("denies a teacher without editUsers reading another user's document", async () => {
    await seedUser(ALICE, student());
    await seedUser(CAROL, teacher());
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(ALICE).get());
  });

  it("allows a teacher with editUsers to read another user's document", async () => {
    await seedUser(ALICE, student());
    await seedUser(CAROL, admin());
    const db = signInAs(CAROL);

    await assertSucceeds(db.collection("users").doc(ALICE).get());
  });

  /** A permission on a student's record grants nothing: they are refused by what they are. */
  it("denies a student whose record lists editUsers", async () => {
    await seedUser(ALICE, student({ permissions: ["editUsers"] }));
    await seedUser(BOB, student());
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(BOB).get());
  });

  it("allows a teacher to read their own document", async () => {
    await seedUser(CAROL, teacher());
    const db = signInAs(CAROL);

    await assertSucceeds(db.collection("users").doc(CAROL).get());
  });
});

describe("/users/{uid} account type and permission immutability", () => {
  it("denies a student changing their own account type", async () => {
    await seedUser(ALICE, student({ firstName: "Alice" }));
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(ALICE).update({ accountType: "teacher" }));
  });

  it("denies a teacher changing their own account type", async () => {
    await seedUser(CAROL, teacher({ firstName: "Carol" }));
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(CAROL).update({ accountType: "student" }));
  });

  /** Granting is a Route Handler's, which owns the refusals a rule cannot express (US-2). */
  it("denies a teacher granting themselves a permission", async () => {
    await seedUser(CAROL, teacher({ firstName: "Carol" }));
    const db = signInAs(CAROL);

    await assertFails(
      db
        .collection("users")
        .doc(CAROL)
        .update({ permissions: ["editMasterData"] }),
    );
  });

  it("denies an admin granting someone else a permission directly", async () => {
    await seedUser(CAROL, admin());
    await seedUser(ALICE, student());
    const db = signInAs(CAROL);

    await assertFails(
      db
        .collection("users")
        .doc(ALICE)
        .update({ permissions: ["editUsers"] }),
    );
  });

  it("denies a teacher changing someone else's role", async () => {
    await seedUser(CAROL, teacher());
    await seedUser(ALICE, student());
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(ALICE).update({ accountType: "teacher" }));
  });

  it("allows a user to update their own remaining fields", async () => {
    await seedUser(ALICE, student({ firstName: "Alice" }));
    const db = signInAs(ALICE);

    await assertSucceeds(db.collection("users").doc(ALICE).update({ firstName: "Alicia" }));
  });

  it("denies a student updating another user's document", async () => {
    await seedUser(ALICE, student());
    await seedUser(BOB, student({ firstName: "Bob" }));
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(BOB).update({ firstName: "Bobby" }));
  });
});

describe("/users/{uid} create and delete", () => {
  it("denies a student creating a user document", async () => {
    await seedUser(ALICE, student());
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(DAVE).set(student()));
  });

  it("denies a teacher creating a user document, since provisioning is server-side only", async () => {
    await seedUser(CAROL, teacher());
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(DAVE).set(student()));
  });

  it("denies a user deleting their own document", async () => {
    await seedUser(ALICE, student());
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(ALICE).delete());
  });

  it("denies a teacher deleting a user document", async () => {
    await seedUser(CAROL, teacher());
    await seedUser(ALICE, student());
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(ALICE).delete());
  });
});

describe("/users/{uid} has no admin role", () => {
  it("grants a document claiming role 'admin' no privileges at all", async () => {
    await seedUser(MALLORY, { accountType: "admin" });
    await seedUser(ALICE, student());
    const db = signInAs(MALLORY);

    await assertFails(db.collection("users").doc(ALICE).get());
    await assertFails(db.collection("users").doc(ALICE).update({ accountType: "teacher" }));
    await assertFails(db.collection("users").doc(DAVE).set(student()));
  });

  it("grants a legacy roles array no privileges, so the old model cannot be reused", async () => {
    await seedUser(MALLORY, { roles: ["teacher", "admin"] });
    await seedUser(ALICE, student());
    const db = signInAs(MALLORY);

    await assertFails(db.collection("users").doc(ALICE).get());
  });
});

/**
 * Production keys `/users` by UPN (see provisionUser), while `request.auth.uid` is an opaque
 * Firebase id. Tests that reuse one value for both silently pass rules that can never match
 * a real request, so these deliberately keep the two apart.
 *
 * The teacher cases read a registration rather than a user record: `/users` now answers only
 * to `isSelf`, so a registration is the one door left that still resolves a role.
 */
describe("identity resolution with a realistic uid", () => {
  const UID = "6Xk2p9QwErTyUiOpAsDf";
  const UPN = "erika.mustermann@htldornbirn.at";

  const signedIn = (claims: Record<string, unknown> = {}) =>
    testEnv.authenticatedContext(UID, { email: UPN, ...claims }).firestore();

  it("lets a user read their own record, which is keyed by UPN and not by uid", async () => {
    await seedUser(UPN, student({ email: UPN }));

    await assertSucceeds(signedIn().collection("users").doc(UPN).get());
  });

  it("still denies reading someone else's record", async () => {
    await seedUser("someone.else@htldornbirn.at", student());

    await assertFails(signedIn().collection("users").doc("someone.else@htldornbirn.at").get());
  });

  it("recognises a teacher whose record is keyed by UPN", async () => {
    await seedUser(UPN, teacher({ email: UPN, permissions: ["editRegistrations"] }));
    await seedRegistration("pupil@student.htldornbirn.at");

    await assertSucceeds(
      signedIn().collection(REGISTRATIONS).doc("pupil@student.htldornbirn.at").get(),
    );
  });

  /**
   * The account type claim spares the common case a document read, but a permission is never
   * taken from it: permissions are granted and withdrawn while a session is live, and a token
   * minted beforehand would go on admitting what an admin has just taken away (US-2).
   */
  it("does not take a permission from the claim, so a record is still read", async () => {
    await seedRegistration("pupil@student.htldornbirn.at");

    await assertFails(
      signedIn({ accountType: "teacher", permissions: ["editRegistrations"] })
        .collection(REGISTRATIONS)
        .doc("pupil@student.htldornbirn.at")
        .get(),
    );
  });

  it("does not grant teacher rights to a student who forges nothing but a uid", async () => {
    await seedUser(UPN, student({ email: UPN }));
    await seedRegistration("pupil@student.htldornbirn.at");

    await assertFails(
      signedIn().collection(REGISTRATIONS).doc("pupil@student.htldornbirn.at").get(),
    );
  });

  it("matches the UPN case-insensitively, since the record id is lowercased", async () => {
    await seedUser(UPN, student({ email: UPN }));

    await assertSucceeds(
      testEnv
        .authenticatedContext(UID, { email: "Erika.Mustermann@HTLDornbirn.at" })
        .firestore()
        .collection("users")
        .doc(UPN)
        .get(),
    );
  });
});
