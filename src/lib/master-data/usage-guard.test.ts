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

const { assertEquipmentNotInUse, assertNotInUse, equipmentNamesInUse, namesInUse, usageReport } =
  await import("./usage-guard");
const { ServiceError } = await import("@/lib/service-error");

/** The lists belong to one event series (US-21), so the question is asked of one series. */
const SERIES = "s1";

beforeEach(() => firestore.reset());

function seedRegistration(id: string, eventSeriesId: string, answers: Record<string, unknown>) {
  firestore.seed("registrations", id, { userId: `u-${id}`, eventSeriesId, ...answers });
}

describe("assertNotInUse", () => {
  it("blocks an item a registration of this event series selected", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("explains that the event series has to be archived first", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
  });

  /** A list is now a series' own, so what another series' registrations hold cannot reach it. */
  it("ignores the registrations of another event series", async () => {
    seedRegistration("r1", "s2", { class: "3AHIT" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
    ).resolves.toBeUndefined();
  });

  it("allows an unused item", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.classes, "4BHIT"),
    ).resolves.toBeUndefined();
  });

  it("compares names the way the rest of the app does, ignoring case and surrounding space", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.classes, " 3ahit "),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("keeps the categories apart, so a program named like a class is not blocked by it", async () => {
    seedRegistration("r1", SERIES, { class: "Alternativ", program: "Ski" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.programs, "Alternativ"),
    ).resolves.toBeUndefined();
  });

  it("blocks a program through the program field", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", program: "Ski" });

    await expect(
      assertNotInUse(SERIES, MASTER_DATA_CATEGORIES.programs, "Ski"),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("assertEquipmentNotInUse", () => {
  it("blocks an entry a student of this event series rented", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(assertEquipmentNotInUse(SERIES, ["Helm"])).rejects.toBeInstanceOf(ServiceError);
  });

  it("ignores what students of another event series rented", async () => {
    seedRegistration("r1", "s2", { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(assertEquipmentNotInUse(SERIES, ["Helm"])).resolves.toBeUndefined();
  });

  /** Requiring an item is the program's business; only renting one makes it used (US-5). */
  it("does not match through the program field, only through the rental selections", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", program: "Ski" });

    await expect(assertEquipmentNotInUse(SERIES, ["Ski"])).resolves.toBeUndefined();
  });

  it("rejects as soon as any one of the names is rented", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(assertEquipmentNotInUse(SERIES, ["Stöcke", " helm "])).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
  });

  it("reads nothing when there is nothing to check", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });
    firestore.queryDocumentsRead = 0;

    await expect(assertEquipmentNotInUse(SERIES, [])).resolves.toBeUndefined();
    expect(firestore.queryDocumentsRead).toBe(0);
  });
});

describe("namesInUse", () => {
  it("reports the names normalized, since that is what the comparison uses", async () => {
    seedRegistration("r1", SERIES, { class: " 3AHIT " });
    seedRegistration("r2", "s2", { class: "4BHIT" });

    await expect(namesInUse(SERIES, MASTER_DATA_CATEGORIES.classes)).resolves.toEqual(
      new Set(["3ahit"]),
    );
  });

  it("is empty when nothing is in use", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(namesInUse(SERIES, MASTER_DATA_CATEGORIES["skill-levels"])).resolves.toEqual(
      new Set(),
    );
  });

  it("skips a registration whose answer was never given", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", skillLevel: null });

    await expect(namesInUse(SERIES, MASTER_DATA_CATEGORIES["skill-levels"])).resolves.toEqual(
      new Set(),
    );
  });
});

describe("equipmentNamesInUse", () => {
  it("gathers the rental selections of this event series", async () => {
    seedRegistration("r1", SERIES, { rentedEquipment: ["Helm", " Stöcke "] });
    seedRegistration("r2", "s2", { rentedEquipment: ["Brille"] });

    await expect(equipmentNamesInUse(SERIES)).resolves.toEqual(new Set(["helm", "stöcke"]));
  });

  it("treats a registration stored before the field existed as renting nothing", async () => {
    seedRegistration("r1", SERIES, { program: "Ski" });

    await expect(equipmentNamesInUse(SERIES)).resolves.toEqual(new Set());
  });
});

describe("usageReport", () => {
  it("names the blocked items as the list stores them, not as a registration spelled them", async () => {
    seedRegistration("r1", SERIES, { class: " 3ahit " });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.classes, [{ name: "3AHIT" }, { name: "4BHIT" }]),
    ).resolves.toEqual({ blockedNames: ["3AHIT"], blockedEquipment: {} });
  });

  it("blocks nothing when nothing is in use", async () => {
    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.classes, [{ name: "3AHIT" }]),
    ).resolves.toEqual({ blockedNames: [], blockedEquipment: {} });
  });

  /** Renaming the program is still fine — only removing the rented entry with it is not. */
  it("names the rented entries of a program, keyed by the program's own name", async () => {
    seedRegistration("r1", SERIES, { program: "Snowboard", rentedEquipment: [" helm "] });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.programs, [
        { name: "Ski", requiredEquipment: ["Helm", "Stöcke"] },
      ]),
    ).resolves.toEqual({ blockedNames: [], blockedEquipment: { Ski: ["Helm"] } });
  });

  it("blocks a program outright once it is itself selected", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", program: "Ski" });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.programs, [
        { name: "Ski", requiredEquipment: [] },
      ]),
    ).resolves.toEqual({ blockedNames: ["Ski"], blockedEquipment: {} });
  });

  it("does not hold one program back for another program's rented equipment", async () => {
    seedRegistration("r1", SERIES, { program: "Snowboard", rentedEquipment: ["Helm"] });

    const report = await usageReport(SERIES, MASTER_DATA_CATEGORIES.programs, [
      { name: "Ski", requiredEquipment: ["Stöcke"] },
      { name: "Snowboard", requiredEquipment: ["Helm"] },
    ]);

    expect(report.blockedEquipment).toEqual({ Snowboard: ["Helm"] });
  });

  it("treats a program requiring nothing as having no entry to hold back", async () => {
    seedRegistration("r1", SERIES, { program: "Snowboard", rentedEquipment: ["Helm"] });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.programs, [{ name: "Ski" }]),
    ).resolves.toEqual({ blockedNames: [], blockedEquipment: {} });
  });

  /** Only a program keeps a list of its own, so no other category can report one (US-5). */
  it("reports no equipment for a category that keeps none", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", rentedEquipment: ["Helm"] });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.classes, [
        { name: "3AHIT", requiredEquipment: ["Helm"] },
      ]),
    ).resolves.toEqual({ blockedNames: ["3AHIT"], blockedEquipment: {} });
  });
});
