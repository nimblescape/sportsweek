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

const { seedMasterDataDefaults } = await import("./seed-defaults");

beforeEach(() => firestore.reset());

function namesOf(collection: string): string[] {
  return Object.values(firestore.docs(collection))
    .map((document) => String(document.name))
    .sort();
}

/** The order the teacher sees, which is the order the defaults were seeded in. */
function orderedNamesOf(collection: string): string[] {
  return Object.values(firestore.docs(collection))
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((document) => String(document.name));
}

function programNamed(name: string): [string, Record<string, unknown>] {
  const entry = Object.entries(firestore.docs("programs")).find(
    ([, document]) => document.name === name,
  );
  if (!entry) throw new Error(`No program named ${name}`);
  return entry;
}

function equipmentOf(programName: string): string[] {
  const [, program] = programNamed(programName);
  return [...(program.requiredEquipment as string[])].sort();
}

describe("seedMasterDataDefaults", () => {
  it("creates the documented defaults for every pre-populated category", async () => {
    await seedMasterDataDefaults();

    expect(namesOf("programs")).toEqual(["Alternativ", "Ski", "Snowboard"]);
    expect(namesOf("skillLevels")).toHaveLength(4);
    expect(namesOf("busPickupPoints")).toHaveLength(4);
    expect(namesOf("foodOptions")).toHaveLength(4);
    expect(namesOf("seasonPassOptions")).toHaveLength(4);
  });

  it("stores the defaults with their German display text", async () => {
    await seedMasterDataDefaults();

    expect(namesOf("skillLevels")).toEqual([
      "Absoluter Anfänger",
      "Anfänger",
      "Fortgeschritten",
      "Profi",
    ]);
    expect(orderedNamesOf("busPickupPoints")).toEqual([
      "HTL Dornbirn",
      "Bahnhof Bregenz",
      "Bahnhof Feldkirch",
      "Unterkunft",
    ]);
    expect(namesOf("foodOptions")).toEqual([
      "Alles",
      "Kein Schweinefleisch",
      "Vegan",
      "Vegetarisch",
    ]);
    expect(orderedNamesOf("seasonPassOptions")).toEqual([
      "Keine",
      "Vielleicht",
      "Golm-Bielerhöhe (Illwerke)",
      "Silvretta-Montafon",
    ]);
  });

  it("leaves classes empty, since that list has no defaults", async () => {
    await seedMasterDataDefaults();

    expect(firestore.count("classOptions")).toBe(0);
  });

  it("gives Ski and Snowboard their equipment and Alternativ none", async () => {
    await seedMasterDataDefaults();

    expect(equipmentOf("Ski")).toEqual(["Helm", "Ski", "Skischuhe", "Stöcke"]);
    expect(equipmentOf("Snowboard")).toEqual(["Board", "Boots", "Helm"]);
    expect(equipmentOf("Alternativ")).toEqual([]);
  });

  it('does not seed "other" as a food option row', async () => {
    await seedMasterDataDefaults();

    expect(namesOf("foodOptions")).not.toContain("other");
    expect(namesOf("foodOptions")).not.toContain("Sonstiges");
  });

  it("claims every seeded name, so a teacher cannot add a duplicate afterwards", async () => {
    await seedMasterDataDefaults();

    expect(firestore.get("reservedNames", "programs|ski")).toMatchObject({ name: "Ski" });
    expect(firestore.get("reservedNames", "seasonPassOptions|vielleicht")).toBeDefined();
  });

  it("is a no-op on the second run", async () => {
    await seedMasterDataDefaults();
    const before = firestore.docs("programs");

    await seedMasterDataDefaults();

    expect(firestore.docs("programs")).toEqual(before);
    expect(namesOf("skillLevels")).toHaveLength(4);
  });

  it("does not recreate an entry the teacher deleted", async () => {
    await seedMasterDataDefaults();
    const doomed = Object.keys(firestore.docs("skillLevels"))[0];
    firestore.deleteDoc("skillLevels", doomed);

    await seedMasterDataDefaults();

    expect(namesOf("skillLevels")).toHaveLength(3);
  });

  it("does not overwrite an entry the teacher renamed", async () => {
    await seedMasterDataDefaults();
    const target = Object.keys(firestore.docs("busPickupPoints"))[0];
    firestore.seed("busPickupPoints", target, { name: "Umbenannt" });

    await seedMasterDataDefaults();

    expect(namesOf("busPickupPoints")).toContain("Umbenannt");
    expect(namesOf("busPickupPoints")).toHaveLength(4);
  });

  it("tolerates a default a teacher had already added by hand", async () => {
    firestore.seed("skillLevels", "manual", { name: "Anfänger" });
    firestore.seed("reservedNames", "skillLevels|anfänger", {
      scope: "skillLevels",
      name: "Anfänger",
      ownerId: "manual",
    });

    await expect(seedMasterDataDefaults()).resolves.toBeUndefined();

    expect(namesOf("skillLevels").filter((name) => name === "Anfänger")).toHaveLength(1);
  });

  it("adds a default introduced later without touching the ones already seeded", async () => {
    await seedMasterDataDefaults();
    const [skiId, ski] = programNamed("Ski");
    firestore.seed("programs", skiId, {
      ...ski,
      requiredEquipment: (ski.requiredEquipment as string[]).filter((item) => item !== "Helm"),
    });

    await seedMasterDataDefaults();

    expect(equipmentOf("Ski")).toEqual(["Ski", "Skischuhe", "Stöcke"]);
  });
});
