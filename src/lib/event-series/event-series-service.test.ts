/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import { registrationPath } from "@/lib/registration/registration";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { createEventSeries, updateEventSeries, deleteEventSeries } =
  await import("./event-series-service");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

/** Mirrors createEventSeries: the name key is derived, so nothing else holds the name (US-4). */
function seedEventSeries(id: string, overrides: Record<string, unknown> = {}) {
  firestore.seed("eventSeries", id, storedEventSeries({ name: `Eventreihe ${id}`, ...overrides }));
}

describe("createEventSeries", () => {
  it("stores a new event series as neither active nor archived", async () => {
    const eventSeries = await createEventSeries({ name: "Wintersportwoche 2026" });

    expect(firestore.get("eventSeries", eventSeries.id)).toEqual(storedEventSeries());
  });

  /** A Kulturwoche must not inherit a Wintersportwoche's lists, so a new one starts blank (US-21). */
  it("starts every maintained list empty, since the lists belong to the series", async () => {
    const eventSeries = await createEventSeries({ name: "Wintersportwoche 2026" });

    expect(eventSeries).toMatchObject({
      classOptions: [],
      programs: [],
      skillLevels: [],
      seasonPassOptions: [],
      busPickupPoints: [],
      foodOptions: [],
    });
  });

  it("returns the event series including its generated id", async () => {
    const eventSeries = await createEventSeries({ name: "Wintersportwoche 2026" });

    expect(eventSeries).toMatchObject({ name: "Wintersportwoche 2026", isActive: false });
    expect(eventSeries.id).toBeTruthy();
  });

  // The position is one number, so it must not cost a download of every event series.
  it("counts the existing event series rather than downloading them", async () => {
    seedEventSeries("s1", { position: 0 });
    seedEventSeries("s2", { position: 1 });
    firestore.queryDocumentsRead = 0;

    const eventSeries = await createEventSeries({ name: "Wintersportwoche 2026" });

    expect(firestore.get("eventSeries", eventSeries.id)).toMatchObject({ position: 2 });
    expect(firestore.queryDocumentsRead).toBe(0);
  });

  it("trims the name", async () => {
    const eventSeries = await createEventSeries({ name: "  Sommersportwoche  " });

    expect(eventSeries.name).toBe("Sommersportwoche");
  });

  it("starts with no registrations", async () => {
    const eventSeries = await createEventSeries({ name: "Wintersportwoche 2026" });

    expect(eventSeries.hasRegistrations).toBe(false);
  });

  it("rejects a blank name", async () => {
    await expect(createEventSeries({ name: "   " })).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("eventSeries")).toBe(0);
  });
});

describe("updateEventSeries", () => {
  it("renames an event series", async () => {
    seedEventSeries("s1");

    await updateEventSeries("s1", { name: "Neuer Name" });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ name: "Neuer Name" });
  });

  it("rejects a rename to a blank name", async () => {
    seedEventSeries("s1");

    await expect(updateEventSeries("s1", { name: "  " })).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ name: "Eventreihe s1" });
  });

  it("reports a missing event series as not found", async () => {
    await expect(updateEventSeries("ghost", { name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("leaves untouched fields alone, the maintained lists among them", async () => {
    seedEventSeries("s1", { isActive: true, classOptions: ["5AHIF"] });

    await updateEventSeries("s1", { name: "Neuer Name" });

    expect(firestore.get("eventSeries", "s1")).toEqual(
      storedEventSeries({ name: "Neuer Name", isActive: true, classOptions: ["5AHIF"] }),
    );
  });
});

describe("updateEventSeries — exactly one active event series", () => {
  it("deactivates the previously active event series when another is activated", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b");

    await updateEventSeries("b", { isActive: true });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("eventSeries", "b")).toMatchObject({ isActive: true });
  });

  it("leaves exactly one active event series across several inactive ones", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b");
    seedEventSeries("c");

    await updateEventSeries("c", { isActive: true });

    const active = Object.values(firestore.docs("eventSeries")).filter(
      (eventSeries) => eventSeries.isActive,
    );
    expect(active).toHaveLength(1);
  });

  it("performs the flip in a single transaction, so a race cannot leave two active", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b");

    let readsSawBothActive = false;
    firestore.onTransactionAttempt = () => {
      const active = Object.values(firestore.docs("eventSeries")).filter(
        (eventSeries) => eventSeries.isActive,
      );
      if (active.length > 1) readsSawBothActive = true;
    };

    await updateEventSeries("b", { isActive: true });

    expect(readsSawBothActive).toBe(false);
    expect(firestore.transactionCount).toBe(1);
  });

  it("activates and renames in the same call", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b");

    await updateEventSeries("b", { name: "Wintersportwoche 2027", isActive: true });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("eventSeries", "b")).toMatchObject({
      name: "Wintersportwoche 2027",
      isActive: true,
    });
  });

  it("stands down every active event series, even if the data already held more than one", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b", { isActive: true });
    seedEventSeries("c");

    await updateEventSeries("c", { isActive: true });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("eventSeries", "b")).toMatchObject({ isActive: false });
    expect(firestore.get("eventSeries", "c")).toMatchObject({ isActive: true });
  });

  it("refuses to activate an archived event series", async () => {
    seedEventSeries("s1", { isArchived: true });

    await expect(updateEventSeries("s1", { isActive: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isActive: false });
  });

  it("refuses to rename an archived event series, which is signed off rather than edited", async () => {
    seedEventSeries("s1", { name: "Winter 2025", isArchived: true });

    await expect(updateEventSeries("s1", { name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ name: "Winter 2025" });
  });

  it("still unarchives one, so signing an event series off stays reversible", async () => {
    seedEventSeries("s1", { name: "Winter 2025", isArchived: true });

    await expect(updateEventSeries("s1", { isArchived: false })).resolves.toMatchObject({
      isArchived: false,
    });
  });

  it("can deactivate the active event series without touching the others", async () => {
    seedEventSeries("a", { isActive: true });
    seedEventSeries("b");

    await updateEventSeries("a", { isActive: false });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ isActive: false });
    expect(firestore.get("eventSeries", "b")).toMatchObject({ isActive: false });
  });

  it("is a no-op flag-wise when the already active event series is activated again", async () => {
    seedEventSeries("a", { isActive: true });

    await updateEventSeries("a", { isActive: true });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ isActive: true });
  });
});

describe("updateEventSeries — archiving", () => {
  it("archives an event series with registrations", async () => {
    seedEventSeries("s1");
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await updateEventSeries("s1", { isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isArchived: true });
  });

  it("self-heals a stale hasRegistrations flag while archiving, since the client relies on it", async () => {
    seedEventSeries("s1", { hasRegistrations: false });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await updateEventSeries("s1", { isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ hasRegistrations: true });
  });

  it("refuses to archive an event series with no registrations", async () => {
    seedEventSeries("s1");

    await expect(updateEventSeries("s1", { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isArchived: false });
  });

  it("refuses to archive the active event series", async () => {
    seedEventSeries("s1", { isActive: true });

    await expect(updateEventSeries("s1", { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isActive: true,
      isArchived: false,
    });
  });

  it("archives an event series deactivated in the same call", async () => {
    seedEventSeries("s1", { isActive: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await updateEventSeries("s1", { isActive: false, isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isActive: false,
      isArchived: true,
    });
  });

  it("unarchives an event series without reactivating it", async () => {
    seedEventSeries("s1", { isArchived: true });

    await updateEventSeries("s1", { isArchived: false });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isActive: false,
      isArchived: false,
    });
  });

  it("refuses to archive and activate in the same call", async () => {
    seedEventSeries("s1");

    await expect(
      updateEventSeries("s1", { isActive: true, isArchived: true }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("deleteEventSeries", () => {
  it("refuses to delete an unarchived event series that still has registrations", async () => {
    seedEventSeries("s1");
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("eventSeries", "s1")).toBeDefined();
  });

  it("refuses to delete an active event series that still has registrations", async () => {
    seedEventSeries("s1", { isActive: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an unarchived event series that has no registrations", async () => {
    seedEventSeries("s1");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes an active event series that has no registrations", async () => {
    seedEventSeries("s1", { isActive: true });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("reports a missing event series as not found", async () => {
    await expect(deleteEventSeries("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes an archived event series", async () => {
    seedEventSeries("s1", { isArchived: true });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes an archived event series that still has registrations", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  it("takes the events of the event series with it, since they are fields of its document", async () => {
    seedEventSeries("s1", { isArchived: true, events: ["Montafon", "Lech"] });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes every registration of the event series", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", {
      studentUpn: "u1",
      emergencyContact: { firstName: "Maria", lastName: "Muster" },
      rentedEquipment: ["Ski"],
    });

    await deleteEventSeries("s1");

    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  it("leaves documents of other event series untouched", async () => {
    seedEventSeries("s1", { isArchived: true, events: ["Montafon"] });
    seedEventSeries("s2", { events: ["Behalten"] });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });
    firestore.seed(registrationPath("s2"), "keep", { studentUpn: "u2" });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s2")).toMatchObject({ events: ["Behalten"] });
    expect(Object.keys(firestore.docs(registrationPath("s2")))).toEqual(["keep"]);
  });

  it("chunks the cascade into batches no larger than the Firestore limit", async () => {
    seedEventSeries("s1", { isArchived: true });
    for (let index = 0; index < 1200; index += 1) {
      firestore.seed(registrationPath("s1"), `m${index}`, { studentUpn: `u${index}` });
    }

    await deleteEventSeries("s1");

    expect(firestore.count(registrationPath("s1"))).toBe(0);
    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    expect(firestore.commitCount).toBeGreaterThan(2);
  });

  it("is retry-safe: deleting the leftovers of a half-finished cascade still succeeds", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "orphan", { studentUpn: "u1" });

    await deleteEventSeries("s1");
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "orphan", { studentUpn: "u1" });

    await expect(deleteEventSeries("s1")).resolves.toBeUndefined();
    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  it("removes the event series only after its dependants are gone", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });
});

describe("event series names are unique", () => {
  it("refuses to create an event series whose name is taken", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });

    await expect(createEventSeries({ name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.count("eventSeries")).toBe(1);
  });

  it("compares names ignoring case and surrounding whitespace", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });

    await expect(createEventSeries({ name: "  winter 2026 " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("still allows a genuinely different name", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });

    await expect(createEventSeries({ name: "Winter 2027" })).resolves.toMatchObject({
      name: "Winter 2027",
    });
  });

  it("refuses to rename an event series onto another event series's name", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });
    seedEventSeries("s2", { name: "Winter 2027" });

    await expect(updateEventSeries("s2", { name: "Winter 2026" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s2")).toMatchObject({ name: "Winter 2027" });
  });

  it("lets an event series keep its own name while another field changes", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await expect(
      updateEventSeries("s1", { name: "Winter 2026", isArchived: true }),
    ).resolves.toMatchObject({ isArchived: true });
  });

  it("does not check the name when only a flag changes", async () => {
    seedEventSeries("s1", { name: "Winter 2026" });

    await expect(updateEventSeries("s1", { isActive: true })).resolves.toMatchObject({
      isActive: true,
    });
  });

  it("allows reusing the name of a deleted event series", async () => {
    seedEventSeries("s1", { name: "Winter 2026", isArchived: true });
    await deleteEventSeries("s1");

    await expect(createEventSeries({ name: "Winter 2026" })).resolves.toBeTruthy();
  });
});
