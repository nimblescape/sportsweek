/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { createSeason, updateSeason, deleteSeason } = await import("./season-service");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

/** Mirrors createSeason: a season and the reservation that holds its name (US-4). */
function seedSeason(id: string, overrides: Record<string, unknown> = {}) {
  const season = {
    name: `Saison ${id}`,
    isActive: false,
    isArchived: false,
    hasStudentData: false,
    ...overrides,
  };
  firestore.seed("seasons", id, season);
  firestore.seed("reservedNames", `seasons|${String(season.name).trim().toLowerCase()}`, {
    scope: "seasons",
    name: season.name,
    ownerId: id,
  });
}

describe("createSeason", () => {
  it("stores a new season as neither active nor archived", async () => {
    const season = await createSeason({ name: "Wintersportwoche 2026" });

    expect(firestore.get("seasons", season.id)).toEqual({
      name: "Wintersportwoche 2026",
      isActive: false,
      isArchived: false,
      hasStudentData: false,
    });
  });

  it("returns the season including its generated id", async () => {
    const season = await createSeason({ name: "Wintersportwoche 2026" });

    expect(season).toMatchObject({ name: "Wintersportwoche 2026", isActive: false });
    expect(season.id).toBeTruthy();
  });

  it("trims the name", async () => {
    const season = await createSeason({ name: "  Sommersportwoche  " });

    expect(season.name).toBe("Sommersportwoche");
  });

  it("starts with no student data", async () => {
    const season = await createSeason({ name: "Wintersportwoche 2026" });

    expect(season.hasStudentData).toBe(false);
  });

  it("rejects a blank name", async () => {
    await expect(createSeason({ name: "   " })).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("seasons")).toBe(0);
  });
});

describe("updateSeason", () => {
  it("renames a season", async () => {
    seedSeason("s1");

    await updateSeason("s1", { name: "Neuer Name" });

    expect(firestore.get("seasons", "s1")).toMatchObject({ name: "Neuer Name" });
  });

  it("rejects a rename to a blank name", async () => {
    seedSeason("s1");

    await expect(updateSeason("s1", { name: "  " })).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get("seasons", "s1")).toMatchObject({ name: "Saison s1" });
  });

  it("reports a missing season as not found", async () => {
    await expect(updateSeason("ghost", { name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("leaves untouched fields alone", async () => {
    seedSeason("s1", { isActive: true });

    await updateSeason("s1", { name: "Neuer Name" });

    expect(firestore.get("seasons", "s1")).toEqual({
      name: "Neuer Name",
      isActive: true,
      isArchived: false,
      hasStudentData: false,
    });
  });
});

describe("updateSeason — exactly one active season", () => {
  it("deactivates the previously active season when another is activated", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b");

    await updateSeason("b", { isActive: true });

    expect(firestore.get("seasons", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("seasons", "b")).toMatchObject({ isActive: true });
  });

  it("leaves exactly one active season across several inactive ones", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b");
    seedSeason("c");

    await updateSeason("c", { isActive: true });

    const active = Object.values(firestore.docs("seasons")).filter((season) => season.isActive);
    expect(active).toHaveLength(1);
  });

  it("performs the flip in a single transaction, so a race cannot leave two active", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b");

    let readsSawBothActive = false;
    firestore.onTransactionAttempt = () => {
      const active = Object.values(firestore.docs("seasons")).filter((season) => season.isActive);
      if (active.length > 1) readsSawBothActive = true;
    };

    await updateSeason("b", { isActive: true });

    expect(readsSawBothActive).toBe(false);
    expect(firestore.transactionCount).toBe(1);
  });

  it("activates and renames in the same call", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b");

    await updateSeason("b", { name: "Wintersportwoche 2027", isActive: true });

    expect(firestore.get("seasons", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("seasons", "b")).toMatchObject({
      name: "Wintersportwoche 2027",
      isActive: true,
    });
  });

  it("stands down every active season, even if the data already held more than one", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b", { isActive: true });
    seedSeason("c");

    await updateSeason("c", { isActive: true });

    expect(firestore.get("seasons", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("seasons", "b")).toMatchObject({ isActive: false });
    expect(firestore.get("seasons", "c")).toMatchObject({ isActive: true });
  });

  it("refuses to activate an archived season", async () => {
    seedSeason("s1", { isArchived: true });

    await expect(updateSeason("s1", { isActive: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("seasons", "s1")).toMatchObject({ isActive: false });
  });

  it("can deactivate the active season without touching the others", async () => {
    seedSeason("a", { isActive: true });
    seedSeason("b");

    await updateSeason("a", { isActive: false });

    expect(firestore.get("seasons", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("seasons", "b")).toMatchObject({ isActive: false });
  });

  it("is a no-op flag-wise when the already active season is activated again", async () => {
    seedSeason("a", { isActive: true });

    await updateSeason("a", { isActive: true });

    expect(firestore.get("seasons", "a")).toMatchObject({ isActive: true });
  });
});

describe("updateSeason — archiving", () => {
  it("archives a season with student data", async () => {
    seedSeason("s1");
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await updateSeason("s1", { isArchived: true });

    expect(firestore.get("seasons", "s1")).toMatchObject({ isArchived: true });
  });

  it("self-heals a stale hasStudentData flag while archiving, since the client relies on it", async () => {
    seedSeason("s1", { hasStudentData: false });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await updateSeason("s1", { isArchived: true });

    expect(firestore.get("seasons", "s1")).toMatchObject({ hasStudentData: true });
  });

  it("refuses to archive a season with no student data", async () => {
    seedSeason("s1");

    await expect(updateSeason("s1", { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("seasons", "s1")).toMatchObject({ isArchived: false });
  });

  it("refuses to archive the active season", async () => {
    seedSeason("s1", { isActive: true });

    await expect(updateSeason("s1", { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("seasons", "s1")).toMatchObject({ isActive: true, isArchived: false });
  });

  it("archives a season deactivated in the same call", async () => {
    seedSeason("s1", { isActive: true });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await updateSeason("s1", { isActive: false, isArchived: true });

    expect(firestore.get("seasons", "s1")).toMatchObject({ isActive: false, isArchived: true });
  });

  it("unarchives a season without reactivating it", async () => {
    seedSeason("s1", { isArchived: true });

    await updateSeason("s1", { isArchived: false });

    expect(firestore.get("seasons", "s1")).toMatchObject({ isActive: false, isArchived: false });
  });

  it("refuses to archive and activate in the same call", async () => {
    seedSeason("s1");

    await expect(updateSeason("s1", { isActive: true, isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("deleteSeason", () => {
  it("refuses to delete an unarchived season that still has student data", async () => {
    seedSeason("s1");
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await expect(deleteSeason("s1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("seasons", "s1")).toBeDefined();
  });

  it("refuses to delete an active season that still has student data", async () => {
    seedSeason("s1", { isActive: true });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await expect(deleteSeason("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an unarchived season that has no student data", async () => {
    seedSeason("s1");

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s1")).toBeUndefined();
  });

  it("deletes an active season that has no student data", async () => {
    seedSeason("s1", { isActive: true });

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s1")).toBeUndefined();
  });

  it("reports a missing season as not found", async () => {
    await expect(deleteSeason("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes an archived season", async () => {
    seedSeason("s1", { isArchived: true });

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s1")).toBeUndefined();
  });

  it("deletes an archived season that still has student data", async () => {
    seedSeason("s1", { isArchived: true });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s1")).toBeUndefined();
    expect(firestore.count("studentMasterData")).toBe(0);
  });

  it("deletes every event of the season", async () => {
    seedSeason("s1", { isArchived: true });
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("events", "e2", { seasonId: "s1", name: "Lech" });

    await deleteSeason("s1");

    expect(firestore.count("events")).toBe(0);
  });

  it("deletes every master data record of the season with its child documents", async () => {
    seedSeason("s1", { isArchived: true });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });
    firestore.seed("emergencyContacts", "c1", { studentMasterDataId: "m1", name: "Mama" });
    firestore.seed("equipmentRentalItems", "r1", { studentMasterDataId: "m1", name: "Ski" });

    await deleteSeason("s1");

    expect(firestore.count("studentMasterData")).toBe(0);
    expect(firestore.count("emergencyContacts")).toBe(0);
    expect(firestore.count("equipmentRentalItems")).toBe(0);
  });

  it("leaves documents of other seasons untouched", async () => {
    seedSeason("s1", { isArchived: true });
    seedSeason("s2");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("events", "keep", { seasonId: "s2", name: "Behalten" });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });
    firestore.seed("studentMasterData", "keep", { seasonId: "s2", studentId: "u2" });
    firestore.seed("emergencyContacts", "keep", { studentMasterDataId: "keep", name: "Papa" });

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s2")).toBeDefined();
    expect(Object.keys(firestore.docs("events"))).toEqual(["keep"]);
    expect(Object.keys(firestore.docs("studentMasterData"))).toEqual(["keep"]);
    expect(Object.keys(firestore.docs("emergencyContacts"))).toEqual(["keep"]);
  });

  it("chunks the cascade into batches no larger than the Firestore limit", async () => {
    seedSeason("s1", { isArchived: true });
    for (let index = 0; index < 1200; index += 1) {
      firestore.seed("events", `e${index}`, { seasonId: "s1", name: `Event ${index}` });
    }

    await deleteSeason("s1");

    expect(firestore.count("events")).toBe(0);
    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    expect(firestore.commitCount).toBeGreaterThan(2);
  });

  it("is retry-safe: deleting the leftovers of a half-finished cascade still succeeds", async () => {
    seedSeason("s1", { isArchived: true });
    firestore.seed("events", "orphan", { seasonId: "s1", name: "Übrig" });

    await deleteSeason("s1");
    firestore.seed("seasons", "s1", {
      name: "Saison s1",
      isActive: false,
      isArchived: true,
      hasStudentData: false,
    });
    firestore.seed("events", "orphan", { seasonId: "s1", name: "Übrig" });

    await expect(deleteSeason("s1")).resolves.toBeUndefined();
    expect(firestore.count("events")).toBe(0);
  });

  it("removes the season only after its dependants are gone", async () => {
    seedSeason("s1", { isArchived: true });
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await deleteSeason("s1");

    expect(firestore.get("seasons", "s1")).toBeUndefined();
    expect(firestore.count("events")).toBe(0);
  });
});

describe("season names are unique", () => {
  it("refuses to create a season whose name is taken", async () => {
    seedSeason("s1", { name: "Winter 2026" });

    await expect(createSeason({ name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.count("seasons")).toBe(1);
  });

  it("compares names ignoring case and surrounding whitespace", async () => {
    seedSeason("s1", { name: "Winter 2026" });

    await expect(createSeason({ name: "  winter 2026 " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("still allows a genuinely different name", async () => {
    seedSeason("s1", { name: "Winter 2026" });

    await expect(createSeason({ name: "Winter 2027" })).resolves.toMatchObject({
      name: "Winter 2027",
    });
  });

  it("refuses to rename a season onto another season's name", async () => {
    seedSeason("s1", { name: "Winter 2026" });
    seedSeason("s2", { name: "Winter 2027" });

    await expect(updateSeason("s2", { name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("seasons", "s2")).toMatchObject({ name: "Winter 2027" });
  });

  it("lets a season keep its own name while another field changes", async () => {
    seedSeason("s1", { name: "Winter 2026" });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1" });

    await expect(
      updateSeason("s1", { name: "Winter 2026", isArchived: true }),
    ).resolves.toMatchObject({ isArchived: true });
  });

  it("does not check the name when only a flag changes", async () => {
    seedSeason("s1", { name: "Winter 2026" });

    await expect(updateSeason("s1", { isActive: true })).resolves.toMatchObject({
      isActive: true,
    });
  });

  it("allows reusing the name of a deleted season", async () => {
    seedSeason("s1", { name: "Winter 2026", isArchived: true });
    await deleteSeason("s1");

    await expect(createSeason({ name: "Winter 2026" })).resolves.toBeTruthy();
  });
});
