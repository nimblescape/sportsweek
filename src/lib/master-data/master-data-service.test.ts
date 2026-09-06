/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { event, storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";
import { registrationPath } from "@/lib/registration/registration";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const service = await import("./master-data-service");
const { ServiceError } = await import("@/lib/service-error");
const { IN_USE_HINT } = await import("./categories");
const { MAX_LIST_ITEMS } = await import("@/lib/schemas/master-data");

/** The one event series every write acts on, since the lists belong to a series (US-21). */
const SERIES = "s1";

// Every write names the series it edits (Q8); bound here so each test states only its own case.
const createMasterDataItem = service.createMasterDataItem.bind(null, SERIES);
const deleteMasterDataItem = service.deleteMasterDataItem.bind(null, SERIES);
const readMasterDataItems = service.readMasterDataItems.bind(null, SERIES);
const reorderMasterDataItems = service.reorderMasterDataItems.bind(null, SERIES);
const updateMasterDataItem = service.updateMasterDataItem.bind(null, SERIES);

beforeEach(() => firestore.reset());
afterEach(() => vi.restoreAllMocks());

function seedActiveEventSeries(lists: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed("eventSeries", SERIES, storedEventSeries(lists));
}

function storedList(field: keyof Omit<EventSeries, "id">) {
  return firestore.get("eventSeries", SERIES)?.[field];
}

/** A registration holds the plain text it selected (US-11), which is what the in-use rule reads. */
function seedRegistration(id: string, answers: Record<string, unknown>) {
  firestore.seed(registrationPath(SERIES), id, { studentUid: id, ...answers });
}

describe("createMasterDataItem", () => {
  it("appends the item to the list its category names on the event series", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });

    const item = await createMasterDataItem("classes", { name: "4BHIT" });

    expect(item).toEqual({ name: "4BHIT", teacherUids: [] });
    expect(storedList("classOptions")).toEqual([
      { name: "3AHIT", teacherUids: [] },
      { name: "4BHIT", teacherUids: [] },
    ]);
  });

  it("trims the name", async () => {
    seedActiveEventSeries();

    const item = await createMasterDataItem("skill-levels", { name: "  Anfänger  " });

    expect(item.name).toBe("Anfänger");
    expect(storedList("skillLevels")).toEqual(["Anfänger"]);
  });

  it("rejects a blank name without writing anything", async () => {
    seedActiveEventSeries();

    await expect(createMasterDataItem("classes", { name: "   " })).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(storedList("classOptions")).toEqual([]);
  });

  /** The whole list is in the write, so a duplicate is decided without a reservation (US-21). */
  it("rejects a name already on the list, ignoring case and surrounding space", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });

    await expect(createMasterDataItem("classes", { name: " 3ahit " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual([{ name: "3AHIT", teacherUids: [] }]);
  });

  it("allows the same name on a different list", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "Alternativ", teacherUids: [] }] });

    await createMasterDataItem("programs", { name: "Alternativ" });

    expect(storedList("programs")).toEqual([{ name: "Alternativ", requiredEquipment: [] }]);
  });

  it("gives a program an empty equipment list rather than no field at all", async () => {
    seedActiveEventSeries();

    const item = await createMasterDataItem("programs", { name: "Ski" });

    expect(item).toEqual({ name: "Ski", requiredEquipment: [] });
  });

  it("stores the equipment a program is created with", async () => {
    seedActiveEventSeries();

    await createMasterDataItem("programs", {
      name: "Ski",
      requiredEquipment: [{ name: "Helm", isRentable: true }],
    });

    expect(storedList("programs")).toEqual([
      { name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] },
    ]);
  });

  it("refuses an equipment list on a category that keeps none", async () => {
    seedActiveEventSeries();

    await expect(
      createMasterDataItem("classes", {
        name: "3AHIT",
        requiredEquipment: [{ name: "Helm", isRentable: true }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(storedList("classOptions")).toEqual([]);
  });

  it("leaves the other lists of the event series untouched", async () => {
    seedActiveEventSeries({ skillLevels: ["Profi"] });

    await createMasterDataItem("classes", { name: "3AHIT" });

    expect(storedList("skillLevels")).toEqual(["Profi"]);
  });

  /** The id comes from a URL a teacher may have kept open past the series being deleted. */
  it("refuses to write to an event series that is not there", async () => {
    firestore.seed("eventSeries", "somebody-else", storedEventSeries());

    await expect(createMasterDataItem("classes", { name: "3AHIT" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to grow a list past what one document should carry", async () => {
    const full = Array.from({ length: MAX_LIST_ITEMS }, (_, at) => ({
      name: `Klasse ${at}`,
      teacherUids: [],
    }));
    seedActiveEventSeries({ classOptions: full });

    await expect(createMasterDataItem("classes", { name: "Eine zu viel" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual(full);
  });

  /**
   * The list the client held may be several edits old, so the change is applied to the document
   * as the transaction finds it — never to the one that was read before it opened.
   */
  it("appends to the list as it stands, not to the one that was read", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "A", teacherUids: [] }] });
    firestore.onTransactionAttempt = (attempt) => {
      if (attempt === 1)
        seedActiveEventSeries({
          classOptions: [
            { name: "A", teacherUids: [] },
            { name: "B", teacherUids: [] },
          ],
        });
    };

    await createMasterDataItem("classes", { name: "C" });

    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
      { name: "C", teacherUids: [] },
    ]);
  });
});

describe("reorderMasterDataItems", () => {
  it("stores the order the teacher dropped the items into", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
        { name: "C", teacherUids: [] },
      ],
    });

    await reorderMasterDataItems("classes", ["C", "A", "B"]);

    expect(storedList("classOptions")).toEqual([
      { name: "C", teacherUids: [] },
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("carries a program's equipment with it", async () => {
    seedActiveEventSeries({
      programs: [
        { name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] },
        { name: "Alternativ", requiredEquipment: [] },
      ],
    });

    await reorderMasterDataItems("programs", ["Alternativ", "Ski"]);

    expect(storedList("programs")).toEqual([
      { name: "Alternativ", requiredEquipment: [] },
      { name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] },
    ]);
  });

  it("names the items the way the rest of the app does, ignoring case and surrounding space", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await reorderMasterDataItems("classes", [" b ", "a"]);

    expect(storedList("classOptions")).toEqual([
      { name: "B", teacherUids: [] },
      { name: "A", teacherUids: [] },
    ]);
  });

  /**
   * An order that is not a permutation would silently drop whatever it left out, so it is
   * refused and the list is left exactly as it stands.
   */
  it("refuses an order that leaves an item out", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(reorderMasterDataItems("classes", ["A"])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("refuses an order carrying an item the list does not hold", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(reorderMasterDataItems("classes", ["A", "B", "C"])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("refuses an order naming one item twice instead of storing it twice", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(reorderMasterDataItems("classes", ["A", "A"])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("reports a name that is no longer on the list rather than moving another item", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(reorderMasterDataItems("classes", ["A", "Weg"])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  /** Moving an item changes no stored name, so no registration can be affected by it. */
  it("moves an item a registration still selects", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });
    seedRegistration("r1", { class: "A" });

    await reorderMasterDataItems("classes", ["B", "A"]);

    expect(storedList("classOptions")).toEqual([
      { name: "B", teacherUids: [] },
      { name: "A", teacherUids: [] },
    ]);
  });
});

describe("updateMasterDataItem", () => {
  it("renames the item where it stands", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
        { name: "C", teacherUids: [] },
      ],
    });

    const item = await updateMasterDataItem("classes", "B", { name: "Beta" });

    expect(item).toEqual({ name: "Beta", teacherUids: [] });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "Beta", teacherUids: [] },
      { name: "C", teacherUids: [] },
    ]);
  });

  it("finds the item by name, ignoring case and surrounding space", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });

    await updateMasterDataItem("classes", "  3ahit ", { name: "3BHIT" });

    expect(storedList("classOptions")).toEqual([{ name: "3BHIT", teacherUids: [] }]);
  });

  /** A stale name is the honest failure a name-as-identity buys: it hits nothing at all. */
  it("reports a name that is no longer on the list rather than editing another item", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(updateMasterDataItem("classes", "Weg", { name: "Neu" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("refuses a rename onto a name the list already carries", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(updateMasterDataItem("classes", "A", { name: " b " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("allows an item to be respelled, since the clash is with itself", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3ahit", teacherUids: [] }] });

    await updateMasterDataItem("classes", "3ahit", { name: "3AHIT" });

    expect(storedList("classOptions")).toEqual([{ name: "3AHIT", teacherUids: [] }]);
  });

  it("keeps a program's equipment when only its name changes", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });

    await updateMasterDataItem("programs", "Ski", { name: "Skifahren" });

    expect(storedList("programs")).toEqual([
      { name: "Skifahren", requiredEquipment: [{ name: "Helm", isRentable: true }] },
    ]);
  });

  it("replaces the equipment list with the one it is given", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });

    await updateMasterDataItem("programs", "Ski", {
      requiredEquipment: [
        { name: "Helm", isRentable: true },
        { name: "Stöcke", isRentable: true },
      ],
    });

    expect(storedList("programs")).toEqual([
      {
        name: "Ski",
        requiredEquipment: [
          { name: "Helm", isRentable: true },
          { name: "Stöcke", isRentable: true },
        ],
      },
    ]);
  });

  it("refuses to rename an item a registration of this event series still selects", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });
    seedRegistration("r1", { class: "3AHIT" });

    await expect(updateMasterDataItem("classes", "3AHIT", { name: "3BHIT" })).rejects.toMatchObject(
      { code: "CONFLICT", message: IN_USE_HINT },
    );
    expect(storedList("classOptions")).toEqual([{ name: "3AHIT", teacherUids: [] }]);
  });

  it("leaves an item alone that only another event series' registrations select", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });
    firestore.seed(registrationPath("s2"), "other", { studentUid: "other", class: "3AHIT" });

    await updateMasterDataItem("classes", "3AHIT", { name: "3BHIT" });

    expect(storedList("classOptions")).toEqual([{ name: "3BHIT", teacherUids: [] }]);
  });

  /** Adding to the list takes nothing away, so the rental selections cannot be orphaned by it. */
  it("adds equipment to a program whose name is in use", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });
    seedRegistration("r1", { program: "Ski", rentedEquipment: ["Helm"] });

    await updateMasterDataItem("programs", "Ski", {
      requiredEquipment: [
        { name: "Helm", isRentable: true },
        { name: "Stöcke", isRentable: true },
      ],
    });

    expect(storedList("programs")).toEqual([
      {
        name: "Ski",
        requiredEquipment: [
          { name: "Helm", isRentable: true },
          { name: "Stöcke", isRentable: true },
        ],
      },
    ]);
  });

  it("refuses to drop an equipment entry a student still rents", async () => {
    seedActiveEventSeries({
      programs: [
        {
          name: "Ski",
          requiredEquipment: [
            { name: "Helm", isRentable: true },
            { name: "Stöcke", isRentable: true },
          ],
        },
      ],
    });
    seedRegistration("r1", { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      updateMasterDataItem("programs", "Ski", {
        requiredEquipment: [{ name: "Stöcke", isRentable: true }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
  });

  it("drops an equipment entry nobody rents", async () => {
    seedActiveEventSeries({
      programs: [
        {
          name: "Ski",
          requiredEquipment: [
            { name: "Helm", isRentable: true },
            { name: "Stöcke", isRentable: true },
          ],
        },
      ],
    });
    seedRegistration("r1", { program: "Ski", rentedEquipment: ["Helm"] });

    await updateMasterDataItem("programs", "Ski", {
      requiredEquipment: [{ name: "Helm", isRentable: true }],
    });

    expect(storedList("programs")).toEqual([
      { name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] },
    ]);
  });

  /**
   * Withdrawing the flag invalidates the same answer as removing the entry would, so it is
   * refused on the same terms (US-36).
   */
  it("refuses to stop lending an entry a student still rents", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });
    seedRegistration("r1", { program: "Ski", rentedEquipment: ["Helm"] });

    await expect(
      updateMasterDataItem("programs", "Ski", {
        requiredEquipment: [{ name: "Helm", isRentable: false }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: IN_USE_HINT });
  });

  it("starts lending an entry nobody could have rented yet", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Hose", isRentable: false }] }],
    });

    await updateMasterDataItem("programs", "Ski", {
      requiredEquipment: [{ name: "Hose", isRentable: true }],
    });

    expect(storedList("programs")).toEqual([
      { name: "Ski", requiredEquipment: [{ name: "Hose", isRentable: true }] },
    ]);
  });

  it("rejects a blank new name", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "A", teacherUids: [] }] });

    await expect(updateMasterDataItem("classes", "A", { name: "  " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(storedList("classOptions")).toEqual([{ name: "A", teacherUids: [] }]);
  });
});

describe("deleteMasterDataItem", () => {
  it("takes the item off the list", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
        { name: "C", teacherUids: [] },
      ],
    });

    await deleteMasterDataItem("classes", "B");

    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "C", teacherUids: [] },
    ]);
  });

  it("finds the item by name, ignoring case and surrounding space", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "3AHIT", teacherUids: [] },
        { name: "4BHIT", teacherUids: [] },
      ],
    });

    await deleteMasterDataItem("classes", " 3ahit ");

    expect(storedList("classOptions")).toEqual([{ name: "4BHIT", teacherUids: [] }]);
  });

  it("reports a name that is no longer on the list rather than deleting another item", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(deleteMasterDataItem("classes", "Weg")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(storedList("classOptions")).toEqual([
      { name: "A", teacherUids: [] },
      { name: "B", teacherUids: [] },
    ]);
  });

  it("refuses to delete an item a registration still selects", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });
    seedRegistration("r1", { class: "3AHIT" });

    await expect(deleteMasterDataItem("classes", "3AHIT")).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
    expect(storedList("classOptions")).toEqual([{ name: "3AHIT", teacherUids: [] }]);
  });

  /**
   * An event is assigned by a teacher rather than chosen by a student (US-12), but a registration
   * points at it by name all the same — so deleting one somebody is on strands the assignment
   * exactly as deleting a class would. It is a list like any other in this respect.
   */
  it("refuses to delete an event a student is assigned to", async () => {
    seedActiveEventSeries({ events: [event("Woche 1"), event("Woche 2")] });
    seedRegistration("r1", { event: "Woche 1" });

    await expect(deleteMasterDataItem("events", "Woche 1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: IN_USE_HINT,
    });
    expect(storedList("events")).toEqual([event("Woche 1"), event("Woche 2")]);
  });

  it("deletes an event nobody is assigned to", async () => {
    seedActiveEventSeries({ events: [event("Woche 1"), event("Woche 2")] });
    seedRegistration("r1", { event: "Woche 1" });

    await deleteMasterDataItem("events", "Woche 2");

    expect(storedList("events")).toEqual([event("Woche 1")]);
  });

  /** Deleting a program would take its equipment along, so a rented entry holds it back too. */
  it("refuses to delete a program whose equipment a student still rents", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });
    seedRegistration("r1", { rentedEquipment: ["Helm"] });

    await expect(deleteMasterDataItem("programs", "Ski")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedList("programs")).toEqual([
      { name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] },
    ]);
  });

  it("deletes a program whose equipment nobody rents", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });

    await deleteMasterDataItem("programs", "Ski");

    expect(storedList("programs")).toEqual([]);
  });
});

/**
 * US-27: the whole edit is one transaction, and the in-use question is asked inside it. Asked
 * beforehand the answer is already stale — a student choosing the value being removed in between
 * would be left holding something the series no longer offers, and no cascade repairs that.
 */
describe("the transaction a list edit runs in", () => {
  function recordOrder(): string[] {
    const order: string[] = [];
    const readDoc = firestore.readDoc.bind(firestore);
    const runQuery = firestore.runQuery.bind(firestore);
    const applyWrite = firestore.applyWrite.bind(firestore);

    vi.spyOn(firestore, "readDoc").mockImplementation((collection, id) => {
      order.push(`read ${collection}`);
      return readDoc(collection, id);
    });
    vi.spyOn(firestore, "runQuery").mockImplementation((collection, filters, limitCount) => {
      order.push(`read ${collection}`);
      return runQuery(collection, filters, limitCount);
    });
    vi.spyOn(firestore, "applyWrite").mockImplementation((write) => {
      order.push(`write ${write.ref.collectionPath}`);
      applyWrite(write);
    });

    return order;
  }

  it("asks whether the item is in use before it writes the list", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "3AHIT", teacherUids: [] },
        { name: "4BHIT", teacherUids: [] },
      ],
    });
    seedRegistration("r1", { class: "4BHIT" });
    const order = recordOrder();

    await updateMasterDataItem("classes", "3AHIT", { name: "3BHIT" });

    expect(order).toEqual([
      "read eventSeries",
      `read ${registrationPath(SERIES)}`,
      "write eventSeries",
    ]);
  });

  it("asks again before deleting, so a hold taken since the list was read still counts", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "3AHIT", teacherUids: [] },
        { name: "4BHIT", teacherUids: [] },
      ],
    });
    seedRegistration("r1", { class: "4BHIT" });
    const order = recordOrder();

    await deleteMasterDataItem("classes", "3AHIT");

    expect(order).toEqual([
      "read eventSeries",
      `read ${registrationPath(SERIES)}`,
      "write eventSeries",
    ]);
  });

  /** One transaction, so the list the guard was asked about is the list that gets written. */
  it("reads the event series, guards and writes in a single transaction", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });

    await updateMasterDataItem("classes", "3AHIT", { name: "3BHIT" });

    expect(firestore.transactionCount).toBe(1);
  });

  /** Adding takes nothing away, so it asks nobody and never waits on a registration. */
  it("asks nothing of the registrations when the edit strands nothing", async () => {
    seedActiveEventSeries({ classOptions: [{ name: "3AHIT", teacherUids: [] }] });
    seedRegistration("r1", { class: "3AHIT" });
    const order = recordOrder();

    await createMasterDataItem("classes", { name: "4BHIT" });
    await reorderMasterDataItems("classes", ["4BHIT", "3AHIT"]);

    expect(order).toEqual([
      "read eventSeries",
      "write eventSeries",
      "read eventSeries",
      "write eventSeries",
    ]);
  });
});

describe("readMasterDataItems", () => {
  it("answers with the active event series and the list its category names", async () => {
    seedActiveEventSeries({
      classOptions: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });

    await expect(readMasterDataItems("classes")).resolves.toEqual({
      eventSeriesId: SERIES,
      items: [
        { name: "A", teacherUids: [] },
        { name: "B", teacherUids: [] },
      ],
    });
  });

  it("carries the equipment a program requires, which is what the usage report keys by", async () => {
    seedActiveEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });

    await expect(readMasterDataItems("programs")).resolves.toMatchObject({
      items: [{ name: "Ski", requiredEquipment: [{ name: "Helm", isRentable: true }] }],
    });
  });

  it("refuses while no event series is active", async () => {
    await expect(readMasterDataItems("classes")).rejects.toBeInstanceOf(ServiceError);
  });
});

/**
 * The five overridable categories (US-33) work the same at event scope as at series scope — same
 * service, same guard, same schema — with only where the list lives differing (Q: "unify, don't
 * reinvent" per the per-event-categories refactor's own instruction).
 */
describe("event scope", () => {
  const WOCHE_1 = { kind: "event", name: "Woche 1" } as const;

  it("reads an event's own list rather than the series'", async () => {
    seedActiveEventSeries({
      events: [event("Woche 1", { programs: [{ name: "Ski", requiredEquipment: [] }] })],
      programs: [{ name: "Snowboard", requiredEquipment: [] }],
    });

    await expect(readMasterDataItems("programs", WOCHE_1)).resolves.toEqual({
      eventSeriesId: SERIES,
      items: [{ name: "Ski", requiredEquipment: [] }],
    });
  });

  it("adds to one event's own list, leaving the series' and its other events' untouched", async () => {
    seedActiveEventSeries({
      events: [event("Woche 1"), event("Woche 2", { skillLevels: ["Profi"] })],
      skillLevels: ["Anfänger:in"],
    });

    await createMasterDataItem("skill-levels", { name: "Profi" }, WOCHE_1);

    expect(storedList("skillLevels")).toEqual(["Anfänger:in"]);
    expect(storedList("events")).toEqual([
      event("Woche 1", { skillLevels: ["Profi"] }),
      event("Woche 2", { skillLevels: ["Profi"] }),
    ]);
  });

  it("renames an entry of one event's list, carrying its other four lists forward untouched", async () => {
    seedActiveEventSeries({
      events: [
        event("Woche 1", {
          skillLevels: ["Anfänger:in"],
          seasonPassOptions: ["Kein Skipass"],
        }),
      ],
    });

    await updateMasterDataItem("skill-levels", "Anfänger:in", { name: "Profi" }, WOCHE_1);

    expect(storedList("events")).toEqual([
      event("Woche 1", { skillLevels: ["Profi"], seasonPassOptions: ["Kein Skipass"] }),
    ]);
  });

  it("deletes an entry of one event's own list", async () => {
    seedActiveEventSeries({
      events: [event("Woche 1", { foodOptions: ["Vegetarisch", "Vegan"] })],
    });

    await deleteMasterDataItem("food-options", "Vegan", WOCHE_1);

    expect(storedList("events")).toEqual([event("Woche 1", { foodOptions: ["Vegetarisch"] })]);
  });

  it("reorders one event's own list", async () => {
    seedActiveEventSeries({
      events: [event("Woche 1", { busPickupPoints: ["A", "B"] })],
    });

    await reorderMasterDataItems("bus-pickup-points", ["B", "A"], WOCHE_1);

    expect(storedList("events")).toEqual([event("Woche 1", { busPickupPoints: ["B", "A"] })]);
  });

  it("still refuses an entry a registration selects, the guard reading the event's own list", async () => {
    seedActiveEventSeries({ events: [event("Woche 1", { skillLevels: ["Profi"] })] });
    seedRegistration("r1", { skillLevel: "Profi" });

    await expect(deleteMasterDataItem("skill-levels", "Profi", WOCHE_1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses a category that names no event, such as classes or the events list itself", async () => {
    seedActiveEventSeries({ events: [event("Woche 1")] });

    await expect(createMasterDataItem("classes", { name: "3AHIT" }, WOCHE_1)).rejects.toMatchObject(
      { code: "VALIDATION_ERROR" },
    );
    await expect(
      createMasterDataItem("events", { name: "Woche 2" }, WOCHE_1),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("reports an event the scope names as not found", async () => {
    seedActiveEventSeries({ events: [event("Woche 1")] });

    await expect(
      createMasterDataItem("skill-levels", { name: "Profi" }, { kind: "event", name: "Ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
