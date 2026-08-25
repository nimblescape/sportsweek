/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the real service against a real Firestore, because "at most one season is active"
 * (US-4) rests on how the Admin SDK actually behaves under contention — a hand-written fake can
 * assert the happy path but never prove that two simultaneous activations cannot both win.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "sportsweek-active-season-integration";

const { adminDb } = await import("@/lib/firebase/admin");
const { createSeason, updateSeason } = await import("@/lib/seasons/season-service");
const { activeSeasonOf } = await import("@/lib/seasons/season-state");
const { seasonSchema } = await import("@/lib/schemas/season");

async function wipe(collection: string) {
  const snapshot = await adminDb.collection(collection).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

async function reset() {
  for (const collection of ["seasons", "events", "reservedNames"]) await wipe(collection);
}

async function storedSeasons() {
  const snapshot = await adminDb.collection("seasons").get();
  return snapshot.docs.map((doc) => seasonSchema.parse({ id: doc.id, ...doc.data() }));
}

async function activeSeasons() {
  return (await storedSeasons()).filter((season) => season.isActive);
}

beforeEach(reset);
afterAll(reset);

describe("exactly one active season against a real Firestore", () => {
  it("stands the previously active season down when another is activated", async () => {
    const [first, second] = await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
    ]);

    await updateSeason(first.id, { isActive: true });
    await updateSeason(second.id, { isActive: true });

    expect(await activeSeasons()).toEqual([expect.objectContaining({ id: second.id })]);
  });

  it("leaves exactly one active season under a burst of simultaneous activations", async () => {
    const seasons = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createSeason({ name: `Winter 20${index}0` })),
    );

    await Promise.allSettled(seasons.map((season) => updateSeason(season.id, { isActive: true })));

    expect(await activeSeasons()).toHaveLength(1);
  });

  it("leaves exactly one active season when activations race a standing active one", async () => {
    const seasons = await Promise.all(
      Array.from({ length: 4 }, (_, index) => createSeason({ name: `Winter 20${index}0` })),
    );
    await updateSeason(seasons[0].id, { isActive: true });

    await Promise.allSettled(
      seasons.slice(1).map((season) => updateSeason(season.id, { isActive: true })),
    );

    expect(await activeSeasons()).toHaveLength(1);
  });

  it("never lets the read helper see an ambiguous result after a flip", async () => {
    const [first, second] = await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
    ]);
    await updateSeason(first.id, { isActive: true });

    await updateSeason(second.id, { isActive: true });

    expect(activeSeasonOf(await storedSeasons())).toMatchObject({ id: second.id });
  });

  it("leaves no season active once the active one is deactivated", async () => {
    const season = await createSeason({ name: "Winter 2026" });
    await updateSeason(season.id, { isActive: true });

    await updateSeason(season.id, { isActive: false });

    expect(await activeSeasons()).toHaveLength(0);
    expect(activeSeasonOf(await storedSeasons())).toBeNull();
  });

  it("activates and renames in one transaction, with every read before the first write", async () => {
    const [first, second] = await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
    ]);
    await updateSeason(first.id, { isActive: true });

    await updateSeason(second.id, { name: "Winter 2028", isActive: true });

    expect(await activeSeasons()).toEqual([
      expect.objectContaining({ id: second.id, name: "Winter 2028" }),
    ]);
    // The old name has to be free again, so the rename really went through (US-4).
    await expect(createSeason({ name: "Winter 2027" })).resolves.toBeTruthy();
  });

  it("refuses to activate an archived season and leaves the active one alone", async () => {
    const [first, second] = await Promise.all([
      createSeason({ name: "Winter 2026" }),
      createSeason({ name: "Winter 2027" }),
    ]);
    await updateSeason(first.id, { isActive: true });
    await updateSeason(second.id, { isArchived: true });

    await expect(updateSeason(second.id, { isActive: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(await activeSeasons()).toEqual([expect.objectContaining({ id: first.id })]);
  });

  it("leaves no season active when the active one is archived", async () => {
    const season = await createSeason({ name: "Winter 2026" });
    await updateSeason(season.id, { isActive: true });

    await updateSeason(season.id, { isArchived: true });

    expect(await activeSeasons()).toHaveLength(0);
  });
});
