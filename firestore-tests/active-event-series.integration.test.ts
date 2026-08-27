/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the real service against a real Firestore, because "at most one event series is active"
 * (US-4) rests on how the Admin SDK actually behaves under contention — a hand-written fake can
 * assert the happy path but never prove that two simultaneous activations cannot both win.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "sportsweek-active-event-series-integration";

const { adminDb } = await import("@/lib/firebase/admin");
const { createEventSeries, updateEventSeries } =
  await import("@/lib/event-series/event-series-service");
const { activeEventSeriesOf } = await import("@/lib/event-series/event-series-state");
const { eventSeriesSchema } = await import("@/lib/schemas/event-series");

async function wipe(collection: string) {
  const snapshot = await adminDb.collection(collection).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

async function reset() {
  for (const collection of ["eventSeries", "events", "reservedNames", "registrations"])
    await wipe(collection);
}

/** Archiving signs off on an event series' registrations (US-4), so there has to be some. */
async function giveStudentData(eventSeriesId: string) {
  await adminDb.collection("registrations").add({ eventSeriesId, studentId: "u1" });
}

async function storedEventSeries() {
  const snapshot = await adminDb.collection("eventSeries").get();
  return snapshot.docs.map((doc) => eventSeriesSchema.parse({ id: doc.id, ...doc.data() }));
}

async function activeEventSeries() {
  return (await storedEventSeries()).filter((eventSeries) => eventSeries.isActive);
}

beforeEach(reset);
afterAll(reset);

describe("exactly one active event series against a real Firestore", () => {
  it("stands the previously active event series down when another is activated", async () => {
    const [first, second] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);

    await updateEventSeries(first.id, { isActive: true });
    await updateEventSeries(second.id, { isActive: true });

    expect(await activeEventSeries()).toEqual([expect.objectContaining({ id: second.id })]);
  });

  it("leaves exactly one active event series under a burst of simultaneous activations", async () => {
    const eventSeries = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createEventSeries({ name: `Winter 20${index}0` })),
    );

    await Promise.allSettled(
      eventSeries.map((eventSeries) => updateEventSeries(eventSeries.id, { isActive: true })),
    );

    expect(await activeEventSeries()).toHaveLength(1);
  });

  it("leaves exactly one active event series when activations race a standing active one", async () => {
    const eventSeries = await Promise.all(
      Array.from({ length: 4 }, (_, index) => createEventSeries({ name: `Winter 20${index}0` })),
    );
    await updateEventSeries(eventSeries[0].id, { isActive: true });

    await Promise.allSettled(
      eventSeries
        .slice(1)
        .map((eventSeries) => updateEventSeries(eventSeries.id, { isActive: true })),
    );

    expect(await activeEventSeries()).toHaveLength(1);
  });

  it("never lets the read helper see an ambiguous result after a flip", async () => {
    const [first, second] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);
    await updateEventSeries(first.id, { isActive: true });

    await updateEventSeries(second.id, { isActive: true });

    expect(activeEventSeriesOf(await storedEventSeries())).toMatchObject({ id: second.id });
  });

  it("leaves no event series active once the active one is deactivated", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await updateEventSeries(eventSeries.id, { isActive: true });

    await updateEventSeries(eventSeries.id, { isActive: false });

    expect(await activeEventSeries()).toHaveLength(0);
    expect(activeEventSeriesOf(await storedEventSeries())).toBeNull();
  });

  it("activates and renames in one transaction, with every read before the first write", async () => {
    const [first, second] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);
    await updateEventSeries(first.id, { isActive: true });

    await updateEventSeries(second.id, { name: "Winter 2028", isActive: true });

    expect(await activeEventSeries()).toEqual([
      expect.objectContaining({ id: second.id, name: "Winter 2028" }),
    ]);
    // The old name has to be free again, so the rename really went through (US-4).
    await expect(createEventSeries({ name: "Winter 2027" })).resolves.toBeTruthy();
  });

  it("refuses to activate an archived event series and leaves the active one alone", async () => {
    const [first, second] = await Promise.all([
      createEventSeries({ name: "Winter 2026" }),
      createEventSeries({ name: "Winter 2027" }),
    ]);
    await updateEventSeries(first.id, { isActive: true });
    await giveStudentData(second.id);
    await updateEventSeries(second.id, { isArchived: true });

    await expect(updateEventSeries(second.id, { isActive: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(await activeEventSeries()).toEqual([expect.objectContaining({ id: first.id })]);
  });

  it("refuses to archive the active event series, which stays active", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await giveStudentData(eventSeries.id);
    await updateEventSeries(eventSeries.id, { isActive: true });

    await expect(updateEventSeries(eventSeries.id, { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(await activeEventSeries()).toEqual([expect.objectContaining({ id: eventSeries.id })]);
  });

  it("leaves no event series active when the active one is deactivated and archived at once", async () => {
    const eventSeries = await createEventSeries({ name: "Winter 2026" });
    await giveStudentData(eventSeries.id);
    await updateEventSeries(eventSeries.id, { isActive: true });

    await updateEventSeries(eventSeries.id, { isActive: false, isArchived: true });

    expect(await activeEventSeries()).toHaveLength(0);
  });
});
