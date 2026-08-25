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

const student = (extra: Record<string, unknown> = {}) => ({ role: "student", ...extra });
const teacher = (extra: Record<string, unknown> = {}) => ({ role: "teacher", ...extra });

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

  it("allows a teacher to read any user's document", async () => {
    await seedUser(ALICE, student());
    await seedUser(CAROL, teacher());
    const db = signInAs(CAROL);

    await assertSucceeds(db.collection("users").doc(ALICE).get());
  });
});

describe("/users/{uid} role immutability", () => {
  it("denies a student changing their own role", async () => {
    await seedUser(ALICE, student({ firstName: "Alice" }));
    const db = signInAs(ALICE);

    await assertFails(db.collection("users").doc(ALICE).update({ role: "teacher" }));
  });

  it("denies a teacher changing their own role", async () => {
    await seedUser(CAROL, teacher({ firstName: "Carol" }));
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(CAROL).update({ role: "student" }));
  });

  it("denies a teacher changing someone else's role", async () => {
    await seedUser(CAROL, teacher());
    await seedUser(ALICE, student());
    const db = signInAs(CAROL);

    await assertFails(db.collection("users").doc(ALICE).update({ role: "teacher" }));
  });

  it("allows a user to update their own non-role fields", async () => {
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
    await seedUser(MALLORY, { role: "admin" });
    await seedUser(ALICE, student());
    const db = signInAs(MALLORY);

    await assertFails(db.collection("users").doc(ALICE).get());
    await assertFails(db.collection("users").doc(ALICE).update({ role: "teacher" }));
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
    await seedUser(UPN, teacher({ email: UPN }));
    await seedUser("pupil@student.htldornbirn.at", student());

    await assertSucceeds(signedIn().collection("users").doc("pupil@student.htldornbirn.at").get());
  });

  it("recognises a teacher from the role claim, without reading the record", async () => {
    await seedUser("pupil@student.htldornbirn.at", student());

    await assertSucceeds(
      signedIn({ role: "teacher" }).collection("users").doc("pupil@student.htldornbirn.at").get(),
    );
  });

  it("does not grant teacher rights to a student who forges nothing but a uid", async () => {
    await seedUser(UPN, student({ email: UPN }));
    await seedUser("pupil@student.htldornbirn.at", student());

    await assertFails(signedIn().collection("users").doc("pupil@student.htldornbirn.at").get());
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
