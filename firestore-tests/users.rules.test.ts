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

describe("/users/{uid} security rules", () => {
  it("denies read access to signed-out users", async () => {
    await seedUser("alice", { roles: ["student"] });
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(db.collection("users").doc("alice").get());
  });

  it("allows a user to read their own document", async () => {
    await seedUser("alice", { roles: ["student"] });
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertSucceeds(db.collection("users").doc("alice").get());
  });

  it("denies a student reading another user's document", async () => {
    await seedUser("bob", { roles: ["student"] });
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("bob").get());
  });

  it("allows a teacher to read any user's document", async () => {
    await seedUser("alice", { roles: ["student"] });
    await seedUser("carol", { roles: ["teacher"] });
    const db = testEnv.authenticatedContext("carol").firestore();

    await assertSucceeds(db.collection("users").doc("alice").get());
  });

  it("denies a non-admin creating a user document", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(
      db
        .collection("users")
        .doc("dave")
        .set({ roles: ["student"] }),
    );
  });

  it("allows an admin to create a user document", async () => {
    await seedUser("admin1", { roles: ["admin"] });
    const db = testEnv.authenticatedContext("admin1").firestore();

    await assertSucceeds(
      db
        .collection("users")
        .doc("dave")
        .set({ roles: ["student"] }),
    );
  });

  it("denies a user changing their own roles", async () => {
    await seedUser("alice", { roles: ["student"], name: "Alice" });
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(
      db
        .collection("users")
        .doc("alice")
        .update({ roles: ["admin"] }),
    );
  });

  it("allows a user to update their own non-role fields", async () => {
    await seedUser("alice", { roles: ["student"], name: "Alice" });
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertSucceeds(db.collection("users").doc("alice").update({ name: "Alice B." }));
  });

  it("allows an admin to change a user's roles", async () => {
    await seedUser("admin1", { roles: ["admin"] });
    await seedUser("alice", { roles: ["student"] });
    const db = testEnv.authenticatedContext("admin1").firestore();

    await assertSucceeds(
      db
        .collection("users")
        .doc("alice")
        .update({ roles: ["teacher"] }),
    );
  });

  it("denies a non-admin deleting a user document", async () => {
    await seedUser("alice", { roles: ["student"] });
    const db = testEnv.authenticatedContext("alice").firestore();

    await assertFails(db.collection("users").doc("alice").delete());
  });
});
