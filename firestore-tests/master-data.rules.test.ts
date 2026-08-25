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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection("users").doc("teacher1").set({ role: "teacher" });
    await db.collection("users").doc("student1").set({ role: "student" });
  });
});

const teacher = () => testEnv.authenticatedContext("teacher1").firestore();
const student = () => testEnv.authenticatedContext("student1").firestore();
const anonymous = () => testEnv.unauthenticatedContext().firestore();

async function seed(collection: string, id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collection).doc(id).set(data);
  });
}

/** Every teacher-maintained list shares the same `{ name }` shape (US-5 to US-10). */
const NAMED_LISTS = [
  "programs",
  "classOptions",
  "skillLevels",
  "busPickupPoints",
  "foodOptions",
  "seasonPassOptions",
];

describe.each(NAMED_LISTS)("/%s", (collection) => {
  it("lets a student read the list, since master data selects from it", async () => {
    await seed(collection, "item1", { name: "Ski" });

    await assertSucceeds(student().collection(collection).doc("item1").get());
  });

  it("denies an unauthenticated read", async () => {
    await seed(collection, "item1", { name: "Ski" });

    await assertFails(anonymous().collection(collection).doc("item1").get());
  });

  it("lets a teacher create an item", async () => {
    await assertSucceeds(teacher().collection(collection).doc("new").set({ name: "Ski" }));
  });

  it("denies a student creating an item", async () => {
    await assertFails(student().collection(collection).doc("new").set({ name: "Ski" }));
  });

  it("denies a student updating an item", async () => {
    await seed(collection, "item1", { name: "Ski" });

    await assertFails(student().collection(collection).doc("item1").update({ name: "Hack" }));
  });

  it("denies a student deleting an item", async () => {
    await seed(collection, "item1", { name: "Ski" });

    await assertFails(student().collection(collection).doc("item1").delete());
  });

  it("lets a teacher delete an item", async () => {
    await seed(collection, "item1", { name: "Ski" });

    await assertSucceeds(teacher().collection(collection).doc("item1").delete());
  });

  it("rejects a create with an unknown field", async () => {
    await assertFails(
      teacher().collection(collection).doc("new").set({ name: "Ski", sneaky: true }),
    );
  });

  it("rejects a create with a blank name", async () => {
    await assertFails(teacher().collection(collection).doc("new").set({ name: "" }));
  });

  it("rejects a create with a non-string name", async () => {
    await assertFails(teacher().collection(collection).doc("new").set({ name: 42 }));
  });

  it("rejects an oversized name", async () => {
    await assertFails(
      teacher()
        .collection(collection)
        .doc("new")
        .set({ name: "x".repeat(121) }),
    );
  });
});

describe("/seasons", () => {
  const valid = { name: "Wintersportwoche 2026", isActive: false, isArchived: false };

  it("lets a student read seasons", async () => {
    await seed("seasons", "s1", valid);

    await assertSucceeds(student().collection("seasons").doc("s1").get());
  });

  it("lets a teacher create a season", async () => {
    await assertSucceeds(teacher().collection("seasons").doc("s1").set(valid));
  });

  it("denies a student creating a season", async () => {
    await assertFails(student().collection("seasons").doc("s1").set(valid));
  });

  it("rejects a season without its flags", async () => {
    await assertFails(teacher().collection("seasons").doc("s1").set({ name: "Ohne Flags" }));
  });

  it("rejects a non-boolean flag", async () => {
    await assertFails(
      teacher()
        .collection("seasons")
        .doc("s1")
        .set({ ...valid, isActive: "yes" }),
    );
  });

  it("rejects an unknown field", async () => {
    await assertFails(
      teacher()
        .collection("seasons")
        .doc("s1")
        .set({ ...valid, deletedAt: "now" }),
    );
  });

  it("lets a teacher archive a season", async () => {
    await seed("seasons", "s1", valid);

    await assertSucceeds(teacher().collection("seasons").doc("s1").update({ isArchived: true }));
  });

  it("denies deleting a season from the client, since removal has to cascade", async () => {
    await seed("seasons", "s1", { ...valid, isArchived: true });

    await assertFails(teacher().collection("seasons").doc("s1").delete());
  });
});

describe("/events", () => {
  const valid = { seasonId: "s1", name: "Montafon" };

  it("lets a student read events", async () => {
    await seed("events", "e1", valid);

    await assertSucceeds(student().collection("events").doc("e1").get());
  });

  it("lets a teacher create an event", async () => {
    await assertSucceeds(teacher().collection("events").doc("e1").set(valid));
  });

  it("denies a student creating an event", async () => {
    await assertFails(student().collection("events").doc("e1").set(valid));
  });

  it("rejects an event without its season", async () => {
    await assertFails(teacher().collection("events").doc("e1").set({ name: "Ohne Saison" }));
  });

  it("rejects an event with a blank season reference", async () => {
    await assertFails(
      teacher()
        .collection("events")
        .doc("e1")
        .set({ ...valid, seasonId: "" }),
    );
  });

  it("denies deleting an event from the client, since removal has to unassign students", async () => {
    await seed("events", "e1", valid);

    await assertFails(teacher().collection("events").doc("e1").delete());
  });
});

describe("/requiredEquipmentItems", () => {
  const valid = { programId: "p1", name: "Helm" };

  it("lets a student read the required equipment", async () => {
    await seed("requiredEquipmentItems", "r1", valid);

    await assertSucceeds(student().collection("requiredEquipmentItems").doc("r1").get());
  });

  it("lets a teacher create an item", async () => {
    await assertSucceeds(teacher().collection("requiredEquipmentItems").doc("r1").set(valid));
  });

  it("denies a student creating an item", async () => {
    await assertFails(student().collection("requiredEquipmentItems").doc("r1").set(valid));
  });

  it("rejects an item without its program", async () => {
    await assertFails(
      teacher().collection("requiredEquipmentItems").doc("r1").set({ name: "Helm" }),
    );
  });
});
