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
const { createMasterDataItem, deleteMasterDataItem } =
  await import("@/lib/master-data/master-data-service");

// Events are one of the maintained lists (US-21), so they are created like any other item.
const createEvent = ({ eventSeriesId, name }: { eventSeriesId: string; name: string }) =>
  createMasterDataItem(eventSeriesId, "events", { name });
const deleteEvent = (eventSeriesId: string, event: string) =>
  deleteMasterDataItem(eventSeriesId, "events", event);

async function wipe(collection: string) {
  const snapshot = await adminDb.collection(collection).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

/** Events are entries of the event series document, so emptying that collection takes them too. */
async function reset() {
  await wipe("eventSeries");
}

async function eventsOf(eventSeriesId: string): Promise<Array<{ name: string }>> {
  const snapshot = await adminDb.collection("eventSeries").doc(eventSeriesId).get();
  return (snapshot.data()?.events ?? []) as Array<{ name: string }>;
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

/**
 * Event names are unique within their own series, and that is now decided by a comparison rather
 * than a query: the whole list is in the document the write already holds (US-21). The index
 * locking these tests were written to catch cannot arise, because no query is made.
 */
describe("event name uniqueness against a real Firestore", () => {
  it("does not make writes to unrelated event series wait for one another", async () => {
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

    for (const series of eventSeries)
      expect(await eventsOf(series.id)).toMatchObject([{ name: "Montafon" }]);
    // Four separate documents, so nothing is shared to contend over. A sibling query used to
    // lock the index range it scanned and take seconds over exactly this.
    expect(elapsed).toBeLessThan(3000);
  });

  it("lets exactly one of two simultaneous creates win within an event series", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });

    await Promise.allSettled([
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
    ]);

    expect(await eventsOf(eventSeries.id)).toMatchObject([{ name: "Montafon" }]);
  });

  it("treats a case-only difference as the same name under contention", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });

    await Promise.allSettled([
      createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" }),
      createEvent({ eventSeriesId: eventSeries.id, name: "MONTAFON" }),
    ]);

    expect(await eventsOf(eventSeries.id)).toHaveLength(1);
  });

  it("allows the same name concurrently in two different event series", async () => {
    const [a, b] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);

    await Promise.all([
      createEvent({ eventSeriesId: a!.id, name: "Montafon" }),
      createEvent({ eventSeriesId: b!.id, name: "Montafon" }),
    ]);

    expect(await eventsOf(a!.id)).toMatchObject([{ name: "Montafon" }]);
    expect(await eventsOf(b!.id)).toMatchObject([{ name: "Montafon" }]);
  });
});

describe("names are freed again when their owner goes", () => {
  it("frees an event name when the event is deleted", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" });

    await deleteEvent(eventSeries.id, "Montafon");

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
    // A second one so the deletion is about freeing names rather than about the last unarchived
    // event series, which is held back so a teacher always has something to select (US-19).
    await createEventSeries({ name: "Winter 2025" });
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Montafon" });
    await createEvent({ eventSeriesId: eventSeries.id, name: "Lech" });

    await deleteEventSeries(eventSeries.id);

    // The events went with the document, so nothing outlives it to keep a name claimed (US-21).
    const reused = await createEventSeries({ name: "Winter 2026" });
    await expect(createEvent({ eventSeriesId: reused.id, name: "Montafon" })).resolves.toBeTruthy();
    await expect(createEvent({ eventSeriesId: reused.id, name: "Lech" })).resolves.toBeTruthy();
  });
});
