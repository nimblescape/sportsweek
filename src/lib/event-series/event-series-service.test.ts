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
  it("stores a new event series as neither active, archived, template nor open", async () => {
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

    expect(eventSeries).toMatchObject({ name: "Wintersportwoche 2026", isArchived: false });
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
    seedEventSeries("s1", { isOpenToStudents: true, classOptions: ["5AHIF"] });

    await updateEventSeries("s1", { name: "Neuer Name" });

    expect(firestore.get("eventSeries", "s1")).toEqual(
      storedEventSeries({
        name: "Neuer Name",
        isOpenToStudents: true,
        classOptions: ["5AHIF"],
      }),
    );
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

  /** Archiving closes a series to students, so the door does not stay open on a finished one. */
  it("closes an event series to students while archiving it", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await updateEventSeries("s1", { isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isArchived: true,
      isOpenToStudents: false,
    });
  });

  /** Looking at last year is not letting last year's students back in (US-19). */
  it("unarchives an event series without reopening it to students", async () => {
    seedEventSeries("s1", { isArchived: true });

    await updateEventSeries("s1", { isArchived: false });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isArchived: false,
      isOpenToStudents: false,
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

  it("refuses to delete an open event series that still has registrations", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an unarchived event series that has no registrations", async () => {
    seedEventSeries("s1");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes an open event series that has no registrations", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("reports a missing event series as not found", async () => {
    await expect(deleteEventSeries("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /**
   * A teacher with nothing to select has a header offering nothing and a navigation bar with
   * nowhere to point. Keeping one template back is what makes that state unreachable.
   */
  it("refuses to delete the only template", async () => {
    seedEventSeries("s1", { isTemplate: true });
    seedEventSeries("s2");

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("eventSeries", "s1")).toBeDefined();
  });

  it("deletes a template while another one remains", async () => {
    seedEventSeries("s1", { isTemplate: true });
    seedEventSeries("s2", { isTemplate: true });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  /** Archiving hides a series from every screen, so an archived template is not one to fall back on. */
  it("refuses to delete the only unarchived template", async () => {
    seedEventSeries("s1", { isTemplate: true });
    seedEventSeries("s2", { isTemplate: true, isArchived: true });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes the last series that is not a template", async () => {
    seedEventSeries("s1");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
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
    seedEventSeries("s1", { name: "Winter 2026", isArchived: true });

    await expect(updateEventSeries("s1", { isArchived: false })).resolves.toMatchObject({
      isArchived: false,
    });
  });

  it("allows reusing the name of a deleted event series", async () => {
    seedEventSeries("s1", { name: "Winter 2026", isArchived: true });
    await deleteEventSeries("s1");

    await expect(createEventSeries({ name: "Winter 2026" })).resolves.toBeTruthy();
  });
});

/**
 * Pressing the overview page's tag is the whole of opening and closing registration (US-19,
 * US-29). The invitation link opens a series too, but closing it again needs no new link.
 */
describe("updateEventSeries — opening to students", () => {
  it("opens a series to students", async () => {
    seedEventSeries("s1", { classOptions: ["3aWI"] });

    await updateEventSeries("s1", { isOpenToStudents: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: true });
  });

  it("closes it again without touching the links it handed out", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });

    await updateEventSeries("s1", { isOpenToStudents: false });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
  });

  it("refuses to open a template, which can never take registrations", async () => {
    seedEventSeries("s1", { isTemplate: true });

    await expect(updateEventSeries("s1", { isOpenToStudents: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
  });

  it("refuses to open an archived series, which cannot even be selected", async () => {
    seedEventSeries("s1", { isArchived: true });

    await expect(updateEventSeries("s1", { isOpenToStudents: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
  });

  /** Archiving closes, and it wins: the two cannot be argued into disagreeing in one call. */
  it("refuses to open and archive in the same call", async () => {
    seedEventSeries("s1");
    firestore.seed(registrationPath("s1"), "m1", { studentUpn: "u1" });

    await expect(
      updateEventSeries("s1", { isOpenToStudents: true, isArchived: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("leaves the flag alone when only the name changes", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });

    await updateEventSeries("s1", { name: "Neuer Name" });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: true });
  });
});

/**
 * US-23: a series with no classes has no link to hand out, so it cannot be opened. That held by
 * construction while generating a link was the only way in; the overview page's tag is a second
 * way (US-29), and it has to be held to the same rule.
 */
describe("updateEventSeries — opening needs a class to invite", () => {
  it("refuses to open a series that has no classes yet", async () => {
    seedEventSeries("s1", { classOptions: [] });

    await expect(updateEventSeries("s1", { isOpenToStudents: true })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
  });

  it("opens one that has a class", async () => {
    seedEventSeries("s1", { classOptions: ["3aWI"] });

    await updateEventSeries("s1", { isOpenToStudents: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: true });
  });

  /** Closing needs no class: a series that lost its last one must still be closable. */
  it("closes one with no classes, which is not the same question", async () => {
    seedEventSeries("s1", { classOptions: [], isOpenToStudents: true });

    await updateEventSeries("s1", { isOpenToStudents: false });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
  });
});
