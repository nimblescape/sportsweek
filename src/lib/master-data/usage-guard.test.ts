/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { IN_USE_HINT, MASTER_DATA_CATEGORIES } from "./categories";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { assertEquipmentNotInUse, assertNotInUse, namesInUse, usageReport } =
  await import("./usage-guard");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

function seedSeason(id: string, isArchived: boolean) {
  firestore.seed("seasons", id, {
    name: `Saison ${id}`,
    isActive: false,
    isArchived,
    hasStudentData: true,
  });
}

function seedRecord(id: string, seasonId: string, fields: Record<string, unknown>) {
  firestore.seed("studentMasterData", id, { userId: `u-${id}`, seasonId, ...fields });
}

describe("assertNotInUse — categories matched through a master data field", () => {
  it("blocks an item selected by a record of a non-archived season", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.classes, "3AHIT")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("explains that the season has to be archived first", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.classes, "3AHIT")).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
  });

  it("allows an item used only by records of archived seasons", async () => {
    seedSeason("done", true);
    seedRecord("r1", "done", { class: "3AHIT" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.classes, "3AHIT")).resolves.toBeUndefined();
  });

  it("allows an unused item", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.classes, "4BHIT")).resolves.toBeUndefined();
  });

  it("compares names the way the rest of the app does, ignoring case and surrounding space", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.classes, " 3ahit ")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("keeps the categories apart, so a program named like a class is not blocked by it", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "Alternativ", program: "Ski" });

    await expect(
      assertNotInUse(MASTER_DATA_CATEGORIES.programs, "Alternativ"),
    ).resolves.toBeUndefined();
  });

  it("blocks a program through the program field", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Ski" });

    await expect(assertNotInUse(MASTER_DATA_CATEGORIES.programs, "Ski")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

describe("assertEquipmentNotInUse", () => {
  it("blocks an entry a student of a non-archived season rented", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Ski" });
    firestore.seed("equipmentRentalItems", "e1", { studentMasterDataId: "r1", itemName: "Helm" });

    await expect(assertEquipmentNotInUse(["Helm"])).rejects.toBeInstanceOf(ServiceError);
  });

  it("allows an entry only rented by students of archived seasons", async () => {
    seedSeason("done", true);
    seedRecord("r1", "done", { class: "3AHIT", program: "Ski" });
    firestore.seed("equipmentRentalItems", "e1", { studentMasterDataId: "r1", itemName: "Helm" });

    await expect(assertEquipmentNotInUse(["Helm"])).resolves.toBeUndefined();
  });

  it("does not match through the program field, only through the rental selections", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Ski" });

    await expect(assertEquipmentNotInUse(["Ski"])).resolves.toBeUndefined();
  });

  it("rejects as soon as any one of the names is rented", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Ski" });
    firestore.seed("equipmentRentalItems", "e1", { studentMasterDataId: "r1", itemName: "Helm" });

    await expect(assertEquipmentNotInUse(["Stöcke", " helm "])).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
  });

  it("reads nothing when there is nothing to check", async () => {
    await expect(assertEquipmentNotInUse([])).resolves.toBeUndefined();
  });
});

describe("namesInUse", () => {
  it("reports the blocked names so the list can disable their controls", async () => {
    seedSeason("open", false);
    seedSeason("done", true);
    seedRecord("r1", "open", { class: "3AHIT" });
    seedRecord("r2", "done", { class: "4BHIT" });

    await expect(namesInUse(MASTER_DATA_CATEGORIES.classes)).resolves.toEqual(new Set(["3ahit"]));
  });

  it("is empty when nothing is in use", async () => {
    seedSeason("open", false);

    await expect(namesInUse(MASTER_DATA_CATEGORIES.classes)).resolves.toEqual(new Set());
  });

  it("skips records whose snapshot field was never filled in", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", skillLevel: null });

    await expect(namesInUse(MASTER_DATA_CATEGORIES["skill-levels"])).resolves.toEqual(new Set());
  });
});

describe("usageReport", () => {
  it("resolves the blocked names onto the items the list renders", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: " 3ahit " });
    firestore.seed("classOptions", "c1", { name: "3AHIT" });
    firestore.seed("classOptions", "c2", { name: "4BHIT" });

    await expect(usageReport(MASTER_DATA_CATEGORIES.classes)).resolves.toEqual({
      blockedIds: ["c1"],
      blockedEquipment: {},
    });
  });

  it("blocks nothing when nothing is in use", async () => {
    seedSeason("open", false);
    firestore.seed("classOptions", "c1", { name: "3AHIT" });

    await expect(usageReport(MASTER_DATA_CATEGORIES.classes)).resolves.toEqual({
      blockedIds: [],
      blockedEquipment: {},
    });
  });

  it("names the rented entries of a program, spelled the way the program stores them", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Snowboard" });
    firestore.seed("programs", "ski", { name: "Ski", requiredEquipment: ["Helm", "Stöcke"] });
    firestore.seed("equipmentRentalItems", "rent1", {
      studentMasterDataId: "r1",
      itemName: " helm ",
    });

    // Renaming the program is still fine — only removing the entry along with it is not.
    await expect(usageReport(MASTER_DATA_CATEGORIES.programs)).resolves.toEqual({
      blockedIds: [],
      blockedEquipment: { ski: ["Helm"] },
    });
  });

  it("blocks a program outright once it is itself selected", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Ski" });
    firestore.seed("programs", "ski", { name: "Ski", requiredEquipment: [] });

    await expect(usageReport(MASTER_DATA_CATEGORIES.programs)).resolves.toEqual({
      blockedIds: ["ski"],
      blockedEquipment: {},
    });
  });

  it("leaves a program whose equipment is only rented in archived seasons alone", async () => {
    seedSeason("done", true);
    seedRecord("r1", "done", { class: "3AHIT", program: "Ski" });
    firestore.seed("programs", "ski", { name: "Ski", requiredEquipment: ["Helm"] });
    firestore.seed("equipmentRentalItems", "rent1", {
      studentMasterDataId: "r1",
      itemName: "Helm",
    });

    await expect(usageReport(MASTER_DATA_CATEGORIES.programs)).resolves.toEqual({
      blockedIds: [],
      blockedEquipment: {},
    });
  });

  it("does not hold one program back for another program's rented equipment", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Snowboard" });
    firestore.seed("programs", "ski", { name: "Ski", requiredEquipment: ["Stöcke"] });
    firestore.seed("programs", "board", { name: "Snowboard", requiredEquipment: ["Helm"] });
    firestore.seed("equipmentRentalItems", "rent1", {
      studentMasterDataId: "r1",
      itemName: "Helm",
    });

    const report = await usageReport(MASTER_DATA_CATEGORIES.programs);

    expect(report.blockedEquipment).toEqual({ board: ["Helm"] });
  });

  it("treats a program stored before the field existed as requiring nothing", async () => {
    seedSeason("open", false);
    seedRecord("r1", "open", { class: "3AHIT", program: "Snowboard" });
    firestore.seed("programs", "ski", { name: "Ski" });

    await expect(usageReport(MASTER_DATA_CATEGORIES.programs)).resolves.toEqual({
      blockedIds: [],
      blockedEquipment: {},
    });
  });
});
