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

const { createMasterDataItem, deleteMasterDataItem, reorderMasterDataItems, updateMasterDataItem } =
  await import("./master-data-service");
const { ServiceError } = await import("@/lib/service-error");
const { IN_USE_HINT } = await import("./categories");

beforeEach(() => firestore.reset());

/** Mirrors createMasterDataItem: the item plus the reservation that holds its name. */
function seedItem(
  collection: string,
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  firestore.seed(collection, id, { name, ...extra });
  firestore.seed("reservedNames", `${collection}|${name.trim().toLowerCase()}`, {
    scope: collection,
    name,
    ownerId: id,
  });
}

function seedProgram(id: string, name: string, requiredEquipment: string[] = []) {
  seedItem("programs", id, name, { requiredEquipment });
}

function seedUsedIn(seasonId: string, isArchived: boolean, fields: Record<string, unknown>) {
  firestore.seed("seasons", seasonId, {
    name: `Saison ${seasonId}`,
    isActive: false,
    isArchived,
    hasStudentData: true,
  });
  firestore.seed("studentMasterData", `r-${seasonId}`, {
    userId: "u1",
    seasonId,
    class: "3AHIT",
    ...fields,
  });
}

function seedRental(seasonId: string, itemName: string) {
  firestore.seed("equipmentRentalItems", `rent-${itemName}`, {
    studentMasterDataId: `r-${seasonId}`,
    itemName,
  });
}

describe("createMasterDataItem", () => {
  it("stores the item under its category's collection", async () => {
    const item = await createMasterDataItem("classes", { name: "3AHIT" });

    expect(firestore.get("classOptions", item.id)).toEqual({ name: "3AHIT", position: 0 });
  });

  it("trims the name", async () => {
    const item = await createMasterDataItem("skill-levels", { name: "  Anfänger  " });

    expect(item.name).toBe("Anfänger");
  });

  it("rejects a blank name without storing anything", async () => {
    await expect(createMasterDataItem("classes", { name: "   " })).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(firestore.count("classOptions")).toBe(0);
  });

  it("rejects a name already taken in the same category", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    await expect(createMasterDataItem("classes", { name: " 3ahit " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.count("classOptions")).toBe(1);
  });

  it("allows the same name in a different category", async () => {
    seedItem("classOptions", "c1", "Alternativ");

    const program = await createMasterDataItem("programs", { name: "Alternativ" });

    expect(firestore.get("programs", program.id)).toEqual({
      name: "Alternativ",
      position: 0,
      requiredEquipment: [],
    });
  });
});

describe("createMasterDataItem — ordering", () => {
  it("puts the first item at the top", async () => {
    const item = await createMasterDataItem("classes", { name: "3AHIT" });

    expect(firestore.get("classOptions", item.id)).toMatchObject({ position: 0 });
  });

  it("appends a new item to the end of the list", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedItem("classOptions", "c2", "4BHIT");

    const item = await createMasterDataItem("classes", { name: "5CHIT" });

    expect(firestore.get("classOptions", item.id)).toMatchObject({ position: 2 });
  });

  // A class list runs to hundreds of entries, and the position is one number.
  it("counts the existing items rather than downloading them", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedItem("classOptions", "c2", "4BHIT");
    firestore.queryDocumentsRead = 0;

    const item = await createMasterDataItem("classes", { name: "5CHIT" });

    expect(firestore.get("classOptions", item.id)).toMatchObject({ position: 2 });
    expect(firestore.queryDocumentsRead).toBe(0);
  });

  it("counts only its own category", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    const item = await createMasterDataItem("skill-levels", { name: "Profi" });

    expect(firestore.get("skillLevels", item.id)).toMatchObject({ position: 0 });
  });
});

describe("reorderMasterDataItems", () => {
  it("stores the order the teacher dropped the items into", async () => {
    seedItem("classOptions", "a", "A", { position: 0 });
    seedItem("classOptions", "b", "B", { position: 1 });

    await reorderMasterDataItems("classes", ["b", "a"]);

    expect(firestore.get("classOptions", "b")).toMatchObject({ position: 0 });
    expect(firestore.get("classOptions", "a")).toMatchObject({ position: 1 });
  });

  it("reorders an item that is in use, since ordering changes no stored value", async () => {
    seedItem("classOptions", "a", "3AHIT", { position: 0 });
    seedItem("classOptions", "b", "4BHIT", { position: 1 });
    seedUsedIn("open", false, {});

    await expect(reorderMasterDataItems("classes", ["b", "a"])).resolves.toBeUndefined();
  });

  it("rejects an unknown category before it can name a collection", async () => {
    await expect(reorderMasterDataItems("users" as "classes", ["a"])).rejects.toBeInstanceOf(Error);
  });
});

describe("createMasterDataItem — required equipment", () => {
  it("stores the equipment list on the program itself", async () => {
    const program = await createMasterDataItem("programs", {
      name: "Ski",
      requiredEquipment: ["Ski", "Helm"],
    });

    expect(firestore.get("programs", program.id)).toEqual({
      name: "Ski",
      position: 0,
      requiredEquipment: ["Ski", "Helm"],
    });
  });

  it("gives a program with no equipment an empty list rather than no field", async () => {
    const program = await createMasterDataItem("programs", { name: "Alternativ" });

    expect(program.requiredEquipment).toEqual([]);
  });

  it("rejects a duplicate entry within one program, ignoring case and surrounding space", async () => {
    await expect(
      createMasterDataItem("programs", { name: "Ski", requiredEquipment: ["Helm", " helm "] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(firestore.count("programs")).toBe(0);
  });

  it("lets two programs each require the same item", async () => {
    await createMasterDataItem("programs", { name: "Ski", requiredEquipment: ["Helm"] });

    await expect(
      createMasterDataItem("programs", { name: "Snowboard", requiredEquipment: ["Helm"] }),
    ).resolves.toMatchObject({ requiredEquipment: ["Helm"] });
  });

  it("rejects a blank entry", async () => {
    await expect(
      createMasterDataItem("programs", { name: "Ski", requiredEquipment: ["  "] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses an equipment list on a category that has none", async () => {
    await expect(
      createMasterDataItem("classes", { name: "3AHIT", requiredEquipment: ["Helm"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("claims no reservation for an entry, since one document holds every sibling", async () => {
    await createMasterDataItem("programs", { name: "Ski", requiredEquipment: ["Helm"] });

    expect(Object.keys(firestore.docs("reservedNames"))).toEqual(["programs|ski"]);
  });
});

describe("updateMasterDataItem", () => {
  it("renames an item and frees the old name", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    await updateMasterDataItem("classes", "c1", { name: "3BHIT" });

    expect(firestore.get("classOptions", "c1")).toMatchObject({ name: "3BHIT" });
    expect(firestore.get("reservedNames", "classOptions|3ahit")).toBeUndefined();
    expect(firestore.get("reservedNames", "classOptions|3bhit")).toMatchObject({ ownerId: "c1" });
  });

  it("lets an item keep its own name", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    await expect(updateMasterDataItem("classes", "c1", { name: "3AHIT" })).resolves.toMatchObject({
      name: "3AHIT",
    });
  });

  it("rejects a rename onto a sibling's name", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedItem("classOptions", "c2", "4BHIT");

    await expect(updateMasterDataItem("classes", "c1", { name: "4bhit" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("classOptions", "c1")).toMatchObject({ name: "3AHIT" });
  });

  it("reports a missing item as not found", async () => {
    await expect(updateMasterDataItem("classes", "ghost", { name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("blocks an item still selected in a non-archived season", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedUsedIn("open", false, {});

    await expect(updateMasterDataItem("classes", "c1", { name: "3BHIT" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
    expect(firestore.get("classOptions", "c1")).toMatchObject({ name: "3AHIT" });
  });

  it("allows an item selected only in archived seasons", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedUsedIn("done", true, {});

    await expect(updateMasterDataItem("classes", "c1", { name: "3BHIT" })).resolves.toMatchObject({
      name: "3BHIT",
    });
  });
});

describe("updateMasterDataItem — required equipment", () => {
  it("rewrites the whole list in one step", async () => {
    seedProgram("ski", "Ski", ["Helm"]);

    await updateMasterDataItem("programs", "ski", { requiredEquipment: ["Helm", "Stöcke"] });

    expect(firestore.get("programs", "ski")).toMatchObject({
      requiredEquipment: ["Helm", "Stöcke"],
    });
  });

  it("leaves the program name alone when only the equipment changes", async () => {
    seedProgram("ski", "Ski", []);

    await updateMasterDataItem("programs", "ski", { requiredEquipment: ["Helm"] });

    expect(firestore.get("programs", "ski")).toMatchObject({ name: "Ski" });
  });

  it("adds an entry even while the program itself is in use", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("open", false, { program: "Ski" });

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: ["Helm", "Stöcke"] }),
    ).resolves.toMatchObject({ requiredEquipment: ["Helm", "Stöcke"] });
  });

  it("refuses to remove an entry a student of an open season still rents", async () => {
    seedProgram("ski", "Ski", ["Helm", "Stöcke"]);
    seedUsedIn("open", false, { program: "Snowboard" });
    seedRental("open", "Helm");

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: ["Stöcke"] }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
    expect(firestore.get("programs", "ski")).toMatchObject({
      requiredEquipment: ["Helm", "Stöcke"],
    });
  });

  it("refuses to rename an entry a student of an open season still rents", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("open", false, { program: "Ski" });
    seedRental("open", "Helm");

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: ["Skihelm"] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats a case-only change as keeping the entry", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("open", false, { program: "Ski" });
    seedRental("open", "Helm");

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: ["HELM"] }),
    ).resolves.toMatchObject({ requiredEquipment: ["HELM"] });
  });

  it("removes an entry rented only in archived seasons", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("done", true, { program: "Ski" });
    seedRental("done", "Helm");

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: [] }),
    ).resolves.toMatchObject({ requiredEquipment: [] });
  });

  it("rejects a duplicate entry", async () => {
    seedProgram("ski", "Ski", []);

    await expect(
      updateMasterDataItem("programs", "ski", { requiredEquipment: ["Helm", "helm"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses an equipment list on a category that has none", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    await expect(
      updateMasterDataItem("classes", "c1", { requiredEquipment: ["Helm"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("deleteMasterDataItem", () => {
  it("removes the item and frees its name", async () => {
    seedItem("classOptions", "c1", "3AHIT");

    await deleteMasterDataItem("classes", "c1");

    expect(firestore.count("classOptions")).toBe(0);
    expect(firestore.get("reservedNames", "classOptions|3ahit")).toBeUndefined();
  });

  it("reports a missing item as not found", async () => {
    await expect(deleteMasterDataItem("classes", "ghost")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("blocks an item still selected in a non-archived season", async () => {
    seedItem("classOptions", "c1", "3AHIT");
    seedUsedIn("open", false, {});

    await expect(deleteMasterDataItem("classes", "c1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
    expect(firestore.count("classOptions")).toBe(1);
  });

  it("takes a program's equipment list down with it", async () => {
    seedProgram("ski", "Ski", ["Helm", "Stöcke"]);

    await deleteMasterDataItem("programs", "ski");

    expect(firestore.count("programs")).toBe(0);
  });

  it("refuses to delete a program whose equipment a student of an open season still rents", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("open", false, { program: "Snowboard" });
    seedRental("open", "Helm");

    await expect(deleteMasterDataItem("programs", "ski")).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
    expect(firestore.count("programs")).toBe(1);
  });

  it("deletes a program whose equipment is only rented in archived seasons", async () => {
    seedProgram("ski", "Ski", ["Helm"]);
    seedUsedIn("done", true, { program: "Ski" });
    seedRental("done", "Helm");

    await deleteMasterDataItem("programs", "ski");

    expect(firestore.count("programs")).toBe(0);
  });

  it("ignores rented equipment another program requires", async () => {
    seedProgram("ski", "Ski", ["Stöcke"]);
    seedProgram("board", "Snowboard", ["Helm"]);
    seedUsedIn("open", false, { program: "Snowboard" });
    seedRental("open", "Helm");

    await deleteMasterDataItem("programs", "ski");

    expect(Object.keys(firestore.docs("programs"))).toEqual(["board"]);
  });

  it("leaves the snapshots already stored on master data records untouched", async () => {
    seedProgram("ski", "Ski", []);
    seedUsedIn("done", true, { program: "Ski" });

    await deleteMasterDataItem("programs", "ski");

    expect(firestore.get("studentMasterData", "r-done")).toMatchObject({ program: "Ski" });
  });
});
