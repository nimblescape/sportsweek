/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Transaction } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { IN_USE_HINT, MASTER_DATA_CATEGORIES } from "./categories";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { assertEquipmentNotInUse, assertNotInUse, usageReport } = await import("./usage-guard");
const { adminDb } = await import("@/lib/firebase/admin");
const { ServiceError } = await import("@/lib/service-error");

/** The lists belong to one event series (US-21), so the question is asked of one series. */
const SERIES = "s1";

beforeEach(() => firestore.reset());

function seedRegistration(id: string, eventSeriesId: string, answers: Record<string, unknown>) {
  firestore.seed("registrations", id, { userId: `u-${id}`, eventSeriesId, ...answers });
}

/**
 * The guards read through the transaction that is about to write the list (US-27), so asking one
 * a question means opening the write it belongs to.
 */
function guard(work: (transaction: Transaction) => Promise<void>): Promise<void> {
  return adminDb.runTransaction(work);
}

describe("assertNotInUse", () => {
  it("blocks an item a registration of this event series selected", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
      ),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("explains that the event series has to be archived first", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
  });

  /** A list is now a series' own, so what another series' registrations hold cannot reach it. */
  it("ignores the registrations of another event series", async () => {
    seedRegistration("r1", "s2", { class: "3AHIT" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
      ),
    ).resolves.toBeUndefined();
  });

  it("allows an unused item", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "4BHIT"),
      ),
    ).resolves.toBeUndefined();
  });

  /**
   * Names compare normalized everywhere else; here the match is exact, because a student picks
   * from the list and so stores the list's own spelling. A respelling is not a value any
   * registration can hold — it could only arrive through the rename this guard refuses.
   */
  it("matches the stored answer exactly, since that is the spelling the list handed out", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, " 3ahit "),
      ),
    ).resolves.toBeUndefined();
  });

  it("keeps the categories apart, so a program named like a class is not blocked by it", async () => {
    seedRegistration("r1", SERIES, { class: "Alternativ", program: "Ski" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.programs, "Alternativ"),
      ),
    ).resolves.toBeUndefined();
  });

  it("blocks a program through the program field", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", program: "Ski" });

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.programs, "Ski"),
      ),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  /**
   * The read has to go through the transaction, or Firestore locks nothing and a save choosing
   * the value being edited slips past between the question and the write (US-27). A transaction
   * refuses a read once it has written, so a guard reading around it would answer here instead.
   */
  it("reads through the transaction it is given rather than around it", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT" });

    await expect(
      adminDb.runTransaction(async (transaction) => {
        transaction.set(adminDb.collection("eventSeries").doc(SERIES), { classOptions: [] });
        await assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "4BHIT");
      }),
    ).rejects.toThrow(/every read before the first write/);
  });

  /** Only the registrations holding this one value are scanned, so nobody else's save waits. */
  it("reads one registration however many the event series has", async () => {
    for (const id of ["r1", "r2", "r3", "r4", "r5"]) {
      seedRegistration(id, SERIES, { class: "3AHIT" });
    }
    firestore.queryDocumentsRead = 0;

    await expect(
      guard((transaction) =>
        assertNotInUse(transaction, SERIES, MASTER_DATA_CATEGORIES.classes, "3AHIT"),
      ),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.queryDocumentsRead).toBe(1);
  });
});

describe("assertEquipmentNotInUse", () => {
  it("blocks an entry a student of this event series rented", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, ["Helm"])),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("ignores what students of another event series rented", async () => {
    seedRegistration("r1", "s2", { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, ["Helm"])),
    ).resolves.toBeUndefined();
  });

  /** Requiring an item is the program's business; only renting one makes it used (US-5). */
  it("does not match through the program field, only through the rental selections", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", program: "Ski" });

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, ["Ski"])),
    ).resolves.toBeUndefined();
  });

  it("rejects as soon as any one of the names is rented", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, ["Stöcke", "Helm"])),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
  });

  /** A rental was picked from the program's own list, so it carries the program's spelling. */
  it("matches a rental exactly, as the program spelled the entry it offered", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, [" helm "])),
    ).resolves.toBeUndefined();
  });

  it("reads nothing when there is nothing to check", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });
    firestore.queryDocumentsRead = 0;

    await expect(
      guard((transaction) => assertEquipmentNotInUse(transaction, SERIES, [])),
    ).resolves.toBeUndefined();
    expect(firestore.queryDocumentsRead).toBe(0);
  });

  it("reads through the transaction it is given rather than around it", async () => {
    seedRegistration("r1", SERIES, { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      adminDb.runTransaction(async (transaction) => {
        transaction.set(adminDb.collection("eventSeries").doc(SERIES), { programs: [] });
        await assertEquipmentNotInUse(transaction, SERIES, ["Stöcke"]);
      }),
    ).rejects.toThrow(/every read before the first write/);
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

  it("leaves the registrations of another event series out of it", async () => {
    seedRegistration("r1", "s2", { class: "3AHIT" });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.classes, [{ name: "3AHIT" }]),
    ).resolves.toEqual({ blockedNames: [], blockedEquipment: {} });
  });

  it("skips a registration whose answer was never given", async () => {
    seedRegistration("r1", SERIES, { class: "3AHIT", skillLevel: null });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES["skill-levels"], [{ name: "Anfänger" }]),
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

  it("treats a registration stored before the rental field existed as renting nothing", async () => {
    seedRegistration("r1", SERIES, { program: "Snowboard" });

    await expect(
      usageReport(SERIES, MASTER_DATA_CATEGORIES.programs, [
        { name: "Ski", requiredEquipment: ["Helm"] },
      ]),
    ).resolves.toEqual({ blockedNames: [], blockedEquipment: {} });
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
