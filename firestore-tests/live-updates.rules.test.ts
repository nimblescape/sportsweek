/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

/**
 * Reproduces what the browser actually does: a client-SDK listener on the event series/events
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

const TEACHER_UID = "uid-of-lehrperson";

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(TEACHER_UID).set({ accountType: "teacher" });
  });
});

const teacherDb = () =>
  testEnv.authenticatedContext(TEACHER_UID, { email: `${TEACHER_UID}@htldornbirn.at` }).firestore();

/** Writes the way a Route Handler does — through the Admin SDK, bypassing rules. */
async function serverWrite(fn: (db: FirebaseFirestore.Firestore) => Promise<unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore() as never);
  });
}

type Emission = { ids: string[]; events: string[] };

/** Collects snapshot emissions so a test can wait for the one it expects. */
function collectSnapshots(builtQuery: ReturnType<typeof query>) {
  const emissions: Emission[] = [];
  let failure: Error | null = null;

  const unsubscribe = onSnapshot(
    builtQuery,
    (snapshot) =>
      emissions.push({
        ids: snapshot.docs.map((d) => d.id),
        events: snapshot.docs.flatMap((d) => (d.data() as { events?: string[] }).events ?? []),
      }),
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

describe("event series list stays live", () => {
  it("delivers a first snapshot", async () => {
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "eventSeries"), orderBy("name", "desc")),
    );

    await listener.waitFor((emission) => emission.ids.length === 0);

    listener.unsubscribe();
  });

  it("pushes an event series created by the server, without resubscribing", async () => {
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "eventSeries"), orderBy("name", "desc")),
    );
    await listener.waitFor((emission) => emission.ids.length === 0);

    await serverWrite((db) =>
      db.collection("eventSeries").doc("new").set({
        name: "2026/2027",
        isOpenToStudents: false,
        isArchived: false,
      }),
    );

    await listener.waitFor((emission) => emission.ids.includes("new"));
    listener.unsubscribe();
  });

  it("pushes a deletion too", async () => {
    await serverWrite((db) =>
      db.collection("eventSeries").doc("gone").set({
        name: "2025/2026",
        isOpenToStudents: false,
        isArchived: false,
      }),
    );
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "eventSeries"), orderBy("name", "desc")),
    );
    await listener.waitFor((emission) => emission.ids.includes("gone"));

    await serverWrite((db) => db.collection("eventSeries").doc("gone").delete());

    await listener.waitFor((emission) => !emission.ids.includes("gone"));
    listener.unsubscribe();
  });
});

/**
 * The events are a field of the event series document (US-21), so what keeps them live is the
 * subscription that already carries every other list rather than a query of their own.
 */
describe("events list stays live", () => {
  it("pushes an event added by the server to the event series being viewed", async () => {
    await serverWrite((db) =>
      db
        .collection("eventSeries")
        .doc("s1")
        .set({ name: "2026/2027", isOpenToStudents: true, isArchived: false, events: [] }),
    );
    const listener = collectSnapshots(
      query(collection(teacherDb() as never, "eventSeries"), orderBy("name")),
    );
    await listener.waitFor((emission) => emission.ids.includes("s1"));

    await serverWrite((db) =>
      db
        .collection("eventSeries")
        .doc("s1")
        .update({ events: ["Montafon"] }),
    );

    await listener.waitFor((emission) => emission.events.includes("Montafon"));
    listener.unsubscribe();
  });

  it("keeps one event series' events out of another's, because each holds its own", async () => {
    await serverWrite((db) =>
      db
        .collection("eventSeries")
        .doc("s2")
        .set({ name: "2027/2028", isOpenToStudents: false, isArchived: false, events: ["Lech"] }),
    );
    const listener = collectSnapshots(
      query(
        collection(teacherDb() as never, "eventSeries"),
        where("isOpenToStudents", "==", true),
        orderBy("name"),
      ),
    );

    await serverWrite((db) =>
      db
        .collection("eventSeries")
        .doc("s1")
        .set({
          name: "2026/2027",
          isOpenToStudents: true,
          isArchived: false,
          events: ["Montafon"],
        }),
    );

    const emission = await listener.waitFor((e) => e.events.includes("Montafon"));
    expect(emission.events).not.toContain("Lech");
    listener.unsubscribe();
  });
});
