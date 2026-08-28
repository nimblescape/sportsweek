/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the real service against a real Firestore, because the uniqueness guarantee rests
 * on how the Admin SDK actually behaves under contention — something a hand-written fake can
 * assert but never prove.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "sportsweek-unique-integration";

const { adminDb } = await import("@/lib/firebase/admin");
const { createEventSeries, updateEventSeries, deleteEventSeries } =
  await import("@/lib/event-series/event-series-service");
const { createEvent, deleteEvent } = await import("@/lib/events/event-service");

async function wipe(collection: string) {
  const snapshot = await adminDb.collection(collection).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

const COLLECTIONS_UNDER_TEST = ["eventSeries", "events"];

async function reset() {
  for (const collection of COLLECTIONS_UNDER_TEST) await wipe(collection);
}

beforeEach(reset);
afterAll(reset);

const settledReasons = (results: PromiseSettledResult<unknown>[]) =>
  results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));

describe("event series name uniqueness against a real Firestore", () => {
  it("rejects a duplicate created one after the other", async () => {
    await createEventSeries({ name: "Winter 2026" });

    await expect(createEventSeries({ name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets exactly one of two simultaneous creates win", async () => {
    const results = await Promise.allSettled([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2026" }),
    ]);

    const snapshot = await adminDb.collection("eventSeries").get();
    expect(snapshot.size).toBe(1);
    expect(settledReasons(results)).toHaveLength(1);
  });

  it("holds under a burst of simultaneous creates", async () => {
    const attempts = Array.from({ length: 8 }, () => createEventSeries({ name: "Winter 2026" }));

    await Promise.allSettled(attempts);

    const snapshot = await adminDb.collection("eventSeries").get();
    expect(snapshot.size).toBe(1);
  });

  it("still lets genuinely different names through concurrently", async () => {
    await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
      createEventSeries({ name: "Winter 2028" }),
    ]);

    const snapshot = await adminDb.collection("eventSeries").get();
    expect(snapshot.size).toBe(3);
  });

  it("treats a case-only difference as the same name under contention", async () => {
    await Promise.allSettled([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "WINTER 2026" }),
    ]);

    const snapshot = await adminDb.collection("eventSeries").get();
    expect(snapshot.size).toBe(1);
  });

  it("refuses a rename onto a name taken in the meantime", async () => {
    const first = await createEventSeries({ name: "Winter 2026" });
    await createEventSeries({ name: "Winter 2027" });

    await expect(updateEventSeries(first.id, { name: "Winter 2027" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("event name uniqueness against a real Firestore", () => {
  it("does not serialise writes to unrelated event series", async () => {
    const eventSeries = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createEventSeries({ name: `Eventreihe ${i}` })),
    );

    const started = Date.now();
    await Promise.all(
      eventSeries.map((eventSeries) =>
        createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
      ),
    );
    const elapsed = Date.now() - started;

    expect(await adminDb.collection("events").get()).toHaveProperty("size", 4);
    // Querying siblings inside the transaction used to take ~20s here through index locks.
    expect(elapsed).toBeLessThan(3000);
  });

  it("lets exactly one of two simultaneous creates win within an event series", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });

    await Promise.allSettled([
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
    ]);

    const snapshot = await adminDb.collection("events").get();
    expect(snapshot.size).toBe(1);
  });

  it("allows the same name concurrently in two different event series", async () => {
    const [a, b] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);

    await Promise.all([
      createEvent({ eventSeriesId: a.id, name: "Montafon" }),
      createEvent({ eventSeriesId: b.id, name: "Montafon" }),
    ]);

    const snapshot = await adminDb.collection("events").get();
    expect(snapshot.size).toBe(2);
  });
});

describe("names are freed again when their owner goes", () => {
  it("frees an event name when the event is deleted", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    const event = await createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" });

    await deleteEvent(event.id);

    await expect(
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
    ).resolves.toBeTruthy();
  });

  it("frees the old name after a rename", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });

    await updateEventSeries(eventSeries.id, { name: "Winter 2027" });

    await expect(createEventSeries({ name: "Winter 2026" })).resolves.toBeTruthy();
  });

  it("frees the event series name and every event name when an event series is deleted", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Lech" });

    await deleteEventSeries(eventSeries.id);

    const reused = await createEventSeries({ name: "Winter 2026" });
    await expect(createEvent({ eventSeriesId: reused.id, name: "Montafon" })).resolves.toBeTruthy();
    await expect(createEvent({ eventSeriesId: reused.id, name: "Lech" })).resolves.toBeTruthy();
  });

  it("frees an event series' name for reuse once the cascade has removed it", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" });

    await deleteEventSeries(eventSeries.id);

    // Nothing outlives the document, because the name is unique by a query over the documents
    // themselves rather than by a reservation that would have to be cleaned up (US-21).
    await expect(createEventSeries({ name: "Winter 2026" })).resolves.toBeTruthy();
  });
});
