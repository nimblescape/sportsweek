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

const student = (extra: Record<string, unknown> = {}) => ({ role: "student", ...extra });
const teacher = (extra: Record<string, unknown> = {}) => ({ role: "teacher", ...extra });

describe("/users/{uid} read access", () => {
  it("denies read access to signed-out users", async () => {
    await seedUser("alice", student());
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(db.collection("users").doc("alice").get());
  });

  it("allows a user to read their own document", async () => {
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertSucceeds(db.collection("users").doc("alice").get());
  });

  it("denies a student reading another user's document", async () => {
    await seedUser("alice", student());
    await seedUser("bob", student());
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("bob").get());
  });

  it("allows a teacher to read any user's document", async () => {
    await seedUser("alice", student());
    await seedUser("carol", teacher());
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertSucceeds(db.collection("users").doc("alice").get());
  });
});

describe("/users/{uid} role immutability", () => {
  it("denies a student changing their own role", async () => {
    await seedUser("alice", student({ firstName: "Alice" }));
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("alice").update({ role: "teacher" }));
  });

  it("denies a teacher changing their own role", async () => {
    await seedUser("carol", teacher({ firstName: "Carol" }));
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertFails(db.collection("users").doc("carol").update({ role: "student" }));
  });

  it("denies a teacher changing someone else's role", async () => {
    await seedUser("carol", teacher());
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertFails(db.collection("users").doc("alice").update({ role: "teacher" }));
  });

  it("allows a user to update their own non-role fields", async () => {
    await seedUser("alice", student({ firstName: "Alice" }));
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertSucceeds(db.collection("users").doc("alice").update({ firstName: "Alicia" }));
  });

  it("denies a student updating another user's document", async () => {
    await seedUser("alice", student());
    await seedUser("bob", student({ firstName: "Bob" }));
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("bob").update({ firstName: "Bobby" }));
  });
});

describe("/users/{uid} create and delete", () => {
  it("denies a student creating a user document", async () => {
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("dave").set(student()));
  });

  it("denies a teacher creating a user document, since provisioning is server-side only", async () => {
    await seedUser("carol", teacher());
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertFails(db.collection("users").doc("dave").set(student()));
  });

  it("denies a user deleting their own document", async () => {
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("alice").delete());
  });

  it("denies a teacher deleting a user document", async () => {
    await seedUser("carol", teacher());
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertFails(db.collection("users").doc("alice").delete());
  });
});

describe("/users/{uid} has no admin role", () => {
  it("grants a document claiming role 'admin' no privileges at all", async () => {
    await seedUser("mallory", { role: "admin" });
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("mallory").firestore();

    await assertFails(db.collection("users").doc("alice").get());
    await assertFails(db.collection("users").doc("alice").update({ role: "teacher" }));
    await assertFails(db.collection("users").doc("dave").set(student()));
  });

  it("grants a legacy roles array no privileges, so the old model cannot be reused", async () => {
    await seedUser("mallory", { roles: ["teacher", "admin"] });
    await seedUser("alice", student());
    const db = testEnv.authenticatedContext("mallory").firestore();

    await assertFails(db.collection("users").doc("alice").get());
  });
});
