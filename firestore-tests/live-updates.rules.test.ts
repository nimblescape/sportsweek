import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

/**
 * Reproduces what the browser actually does: a client-SDK listener on the seasons/events
 * query while the server writes through privileged access. Rules-only tests cannot catch a
 * listener that is allowed to read yet never receives the push.
 */
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "sportsweek-live-updates-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());

const TEACHER_UPN = "lehrperson@htldornbirn.at";

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(TEACHER_UPN).set({ role: "teacher" });
  });
});

const teacherDb = () =>
  testEnv.authenticatedContext(`uid-of-${TEACHER_UPN}`, { email: TEACHER_UPN }).firestore();

/** Writes the way a Route Handler does — through the Admin SDK, bypassing rules. */
async function serverWrite(fn: (db: FirebaseFirestore.Firestore) => Promise<unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore() as never);
  });
}

type Emission = { ids: string[] };

/** Collects snapshot emissions so a test can wait for the one it expects. */
function collectSnapshots(builtQuery: ReturnType<typeof query>) {
  const emissions: Emission[] = [];
  let failure: Error | null = null;

  const unsubscribe = onSnapshot(
    builtQuery,
    (snapshot) => emissions.push({ ids: snapshot.docs.map((d) => d.id) }),
    (error) => {
      failure = error as Error;
    },
  );

  return {
    emissions,
    get failure() {
      return failure;
    },
    unsubscribe,
    async waitFor(predicate: (emission: Emission) => boolean, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (failure) throw failure;
        const match = emissions.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(
        `No matching snapshot within ${timeoutMs}ms. Saw: ${JSON.stringify(emissions)}`,
      );
    },
  };
}

describe("seasons list stays live", () => {
  it("delivers a first snapshot", async () => {
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "seasons"), orderBy("name", "desc")),
    );

    await listener.waitFor((emission) => emission.ids.length === 0);

    listener.unsubscribe();
  });

  it("pushes a season created by the server, without resubscribing", async () => {
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "seasons"), orderBy("name", "desc")),
    );
    await listener.waitFor((emission) => emission.ids.length === 0);

    await serverWrite((db) =>
      db.collection("seasons").doc("new").set({
        name: "2026/2027",
        isActive: false,
        isArchived: false,
      }),
    );

    await listener.waitFor((emission) => emission.ids.includes("new"));
    listener.unsubscribe();
  });

  it("pushes a deletion too", async () => {
    await serverWrite((db) =>
      db.collection("seasons").doc("gone").set({
        name: "2025/2026",
        isActive: false,
        isArchived: false,
      }),
    );
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "seasons"), orderBy("name", "desc")),
    );
    await listener.waitFor((emission) => emission.ids.includes("gone"));

    await serverWrite((db) => db.collection("seasons").doc("gone").delete());

    await listener.waitFor((emission) => !emission.ids.includes("gone"));
    listener.unsubscribe();
  });
});

describe("events list stays live", () => {
  it("pushes an event created by the server for the season being viewed", async () => {
    const listener = collectSnapshots(
      query(
        collection(teacherDb() as never, "events"),
        where("seasonId", "==", "s1"),
        orderBy("name"),
      ),
    );
    await listener.waitFor((emission) => emission.ids.length === 0);

    await serverWrite((db) =>
      db.collection("events").doc("e1").set({ seasonId: "s1", name: "Montafon" }),
    );

    await listener.waitFor((emission) => emission.ids.includes("e1"));
    listener.unsubscribe();
  });

  it("ignores an event created for a different season", async () => {
    const listener = collectSnapshots(
      query(
        collection(teacherDb() as never, "events"),
        where("seasonId", "==", "s1"),
        orderBy("name"),
      ),
    );
    await listener.waitFor((emission) => emission.ids.length === 0);

    await serverWrite((db) =>
      db.collection("events").doc("other").set({ seasonId: "s2", name: "Lech" }),
    );
    await serverWrite((db) =>
      db.collection("events").doc("mine").set({ seasonId: "s1", name: "Montafon" }),
    );

    const emission = await listener.waitFor((e) => e.ids.includes("mine"));
    expect(emission.ids).not.toContain("other");
    listener.unsubscribe();
  });
});
