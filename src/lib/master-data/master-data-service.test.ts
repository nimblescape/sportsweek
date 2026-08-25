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

const { createMasterDataItem, deleteMasterDataItem, updateMasterDataItem } =
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
  const scope = "programId" in extra ? `${collection}:${String(extra.programId)}` : collection;
  firestore.seed("reservedNames", `${scope}|${name.trim().toLowerCase()}`, {
    scope,
    name,
    ownerId: id,
  });
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

describe("createMasterDataItem", () => {
  it("stores the item under its category's collection", async () => {
    const item = await createMasterDataItem("classes", { name: "3AHIT" });

    expect(firestore.get("classOptions", item.id)).toEqual({ name: "3AHIT" });
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

    expect(firestore.get("programs", program.id)).toEqual({ name: "Alternativ" });
  });
});

describe("createMasterDataItem — nested lists", () => {
  beforeEach(() => {
    seedItem("programs", "ski", "Ski");
    seedItem("programs", "board", "Snowboard");
  });

  it("stores the parent id alongside the name", async () => {
    const item = await createMasterDataItem("required-equipment", {
      name: "Helm",
      parentId: "ski",
    });

    expect(firestore.get("requiredEquipmentItems", item.id)).toEqual({
      name: "Helm",
      programId: "ski",
    });
  });

  it("keeps names unique only within their program", async () => {
    await createMasterDataItem("required-equipment", { name: "Helm", parentId: "ski" });

    await expect(
      createMasterDataItem("required-equipment", { name: "Helm", parentId: "board" }),
    ).resolves.toMatchObject({ name: "Helm" });

    await expect(
      createMasterDataItem("required-equipment", { name: "helm", parentId: "ski" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to attach an item to a program that does not exist", async () => {
    await expect(
      createMasterDataItem("required-equipment", { name: "Helm", parentId: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a nested item with no parent at all", async () => {
    await expect(
      createMasterDataItem("required-equipment", { name: "Helm" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("ignores a parent id on a flat category", async () => {
    const item = await createMasterDataItem("classes", { name: "3AHIT", parentId: "ski" });

    expect(firestore.get("classOptions", item.id)).toEqual({ name: "3AHIT" });
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

  it("blocks a rented equipment item through the rental rows, not through its program", async () => {
    seedItem("programs", "ski", "Ski");
    seedItem("requiredEquipmentItems", "e1", "Helm", { programId: "ski" });
    seedUsedIn("open", false, { program: "Ski" });
    firestore.seed("equipmentRentalItems", "rent1", {
      studentMasterDataId: "r-open",
      itemName: "Helm",
    });

    await expect(
      updateMasterDataItem("required-equipment", "e1", { name: "Skihelm" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("leaves an equipment item alone when only its program is in use", async () => {
    seedItem("programs", "ski", "Ski");
    seedItem("requiredEquipmentItems", "e1", "Helm", { programId: "ski" });
    seedUsedIn("open", false, { program: "Ski" });

    await expect(
      updateMasterDataItem("required-equipment", "e1", { name: "Skihelm" }),
    ).resolves.toMatchObject({ name: "Skihelm" });
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

  it("takes a program's required equipment items down with it", async () => {
    seedItem("programs", "ski", "Ski");
    seedItem("requiredEquipmentItems", "e1", "Helm", { programId: "ski" });
    seedItem("requiredEquipmentItems", "e2", "Stöcke", { programId: "ski" });
    seedItem("requiredEquipmentItems", "e3", "Board", { programId: "board" });

    await deleteMasterDataItem("programs", "ski");

    expect(Object.keys(firestore.docs("requiredEquipmentItems"))).toEqual(["e3"]);
    expect(firestore.get("reservedNames", "requiredEquipmentItems:ski|helm")).toBeUndefined();
    expect(firestore.get("reservedNames", "requiredEquipmentItems:board|board")).toBeDefined();
  });

  it("leaves the snapshots already stored on master data records untouched", async () => {
    seedItem("programs", "ski", "Ski");
    seedUsedIn("done", true, { program: "Ski" });

    await deleteMasterDataItem("programs", "ski");

    expect(firestore.get("studentMasterData", "r-done")).toMatchObject({ program: "Ski" });
  });
});
