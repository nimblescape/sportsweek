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
const { createSeason, updateSeason, deleteSeason } = await import("@/lib/seasons/season-service");
const { createEvent, deleteEvent } = await import("@/lib/events/event-service");

async function wipe(collection: string) {
  const snapshot = await adminDb.collection(collection).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

// reservedNames has to go too: a leftover reservation blocks the name it still holds.
const COLLECTIONS_UNDER_TEST = ["seasons", "events", "reservedNames"];

async function reset() {
  for (const collection of COLLECTIONS_UNDER_TEST) await wipe(collection);
}

beforeEach(reset);
afterAll(reset);

const settledReasons = (results: PromiseSettledResult<unknown>[]) =>
  results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));

describe("season name uniqueness against a real Firestore", () => {
  it("rejects a duplicate created one after the other", async () => {
    await createSeason({ name: "Winter 2026" });

    await expect(createSeason({ name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets exactly one of two simultaneous creates win", async () => {
    const results = await Promise.allSettled([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2026" }),
    ]);

    const snapshot = await adminDb.collection("seasons").get();
    expect(snapshot.size).toBe(1);
    expect(settledReasons(results)).toHaveLength(1);
  });

  it("holds under a burst of simultaneous creates", async () => {
    const attempts = Array.from({ length: 8 }, () => createSeason({ name: "Winter 2026" }));

    await Promise.allSettled(attempts);

    const snapshot = await adminDb.collection("seasons").get();
    expect(snapshot.size).toBe(1);
  });

  it("still lets genuinely different names through concurrently", async () => {
    await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
      createSeason({ name: "Winter 2028" }),
    ]);

    const snapshot = await adminDb.collection("seasons").get();
    expect(snapshot.size).toBe(3);
  });

  it("treats a case-only difference as the same name under contention", async () => {
    await Promise.allSettled([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "WINTER 2026" }),
    ]);

    const snapshot = await adminDb.collection("seasons").get();
    expect(snapshot.size).toBe(1);
  });

  it("refuses a rename onto a name taken in the meantime", async () => {
    const first = await createSeason({ name: "Winter 2026" });
    await createSeason({ name: "Winter 2027" });

    await expect(updateSeason(first.id, { name: "Winter 2027" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("event name uniqueness against a real Firestore", () => {
  it("does not serialise writes to unrelated seasons", async () => {
    const seasons = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createSeason({ name: `Saison ${i}` })),
    );

    const started = Date.now();
    await Promise.all(
      seasons.map((season) => createEvent({ seasonId: season.id, name: "Montafon" })),
    );
    const elapsed = Date.now() - started;

    expect(await adminDb.collection("events").get()).toHaveProperty("size", 4);
    // Querying siblings inside the transaction used to take ~20s here through index locks.
    expect(elapsed).toBeLessThan(3000);
  });

  it("lets exactly one of two simultaneous creates win within a season", async () => {
    const season = await createSeason({ name: "Winter 2026" });

    await Promise.allSettled([
      createEvent({ seasonId: season.id, name: "Montafon" }),
      createEvent({ seasonId: season.id, name: "Montafon" }),
    ]);

    const snapshot = await adminDb.collection("events").get();
    expect(snapshot.size).toBe(1);
  });

  it("allows the same name concurrently in two different seasons", async () => {
    const [a, b] = await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
    ]);

    await Promise.all([
      createEvent({ seasonId: a.id, name: "Montafon" }),
      createEvent({ seasonId: b.id, name: "Montafon" }),
    ]);

    const snapshot = await adminDb.collection("events").get();
    expect(snapshot.size).toBe(2);
  });
});

describe("names are freed again when their owner goes", () => {
  it("frees an event name when the event is deleted", async () => {
    const season = await createSeason({ name: "Winter 2026" });
    const event = await createEvent({ seasonId: season.id, name: "Montafon" });

    await deleteEvent(event.id);

    await expect(createEvent({ seasonId: season.id, name: "Montafon" })).resolves.toBeTruthy();
  });

  it("frees the old name after a rename", async () => {
    const season = await createSeason({ name: "Winter 2026" });

    await updateSeason(season.id, { name: "Winter 2027" });

    await expect(createSeason({ name: "Winter 2026" })).resolves.toBeTruthy();
  });

  it("frees the season name and every event name when a season is deleted", async () => {
    const season = await createSeason({ name: "Winter 2026" });
    await createEvent({ seasonId: season.id, name: "Montafon" });
    await createEvent({ seasonId: season.id, name: "Lech" });
    await updateSeason(season.id, { isArchived: true });

    await deleteSeason(season.id);

    const reused = await createSeason({ name: "Winter 2026" });
    await expect(createEvent({ seasonId: reused.id, name: "Montafon" })).resolves.toBeTruthy();
    await expect(createEvent({ seasonId: reused.id, name: "Lech" })).resolves.toBeTruthy();
  });

  it("leaves no reservation behind after a season cascade", async () => {
    const season = await createSeason({ name: "Winter 2026" });
    await createEvent({ seasonId: season.id, name: "Montafon" });
    await updateSeason(season.id, { isArchived: true });

    await deleteSeason(season.id);

    const snapshot = await adminDb.collection("reservedNames").get();
    expect(snapshot.size).toBe(0);
  });
});
