/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { createEvent, updateEvent, deleteEvent, reorderEvents } = await import("./event-service");
const { ServiceError } = await import("@/lib/service-error");
const { MAX_LIST_ITEMS } = await import("@/lib/schemas/master-data");

beforeEach(() => firestore.reset());

function seedEventSeries(id: string, overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed("eventSeries", id, storedEventSeries({ name: `Eventreihe ${id}`, ...overrides }));
}

const storedEvents = (id: string) => firestore.get("eventSeries", id)?.events;

/** A registration names the event it is assigned to, exactly as it names its class (US-11). */
function seedRegistration(id: string, eventSeriesId: string, answers: Record<string, unknown>) {
  firestore.seed("registrations", id, { userId: `u-${id}`, eventSeriesId, ...answers });
}

describe("createEvent", () => {
  it("appends the event to its event series' own list", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });

    const event = await createEvent({ eventSeriesId: "s1", name: "Woche 2" });

    expect(event).toEqual({ eventSeriesId: "s1", name: "Woche 2" });
    expect(storedEvents("s1")).toEqual(["Woche 1", "Woche 2"]);
  });

  it("trims the name", async () => {
    seedEventSeries("s1");

    await expect(createEvent({ eventSeriesId: "s1", name: "  Lech  " })).resolves.toMatchObject({
      name: "Lech",
    });
    expect(storedEvents("s1")).toEqual(["Lech"]);
  });

  it("rejects a blank name", async () => {
    seedEventSeries("s1");

    await expect(createEvent({ eventSeriesId: "s1", name: " " })).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(storedEvents("s1")).toEqual([]);
  });

  it("refuses to attach an event to an event series that does not exist", async () => {
    await expect(createEvent({ eventSeriesId: "ghost", name: "Montafon" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to add an event to an archived event series", async () => {
    seedEventSeries("s1", { isArchived: true });

    await expect(createEvent({ eventSeriesId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedEvents("s1")).toEqual([]);
  });

  it("refuses a list longer than the cap the schema states", async () => {
    const full = Array.from({ length: MAX_LIST_ITEMS }, (_, index) => `Woche ${index}`);
    seedEventSeries("s1", { events: full });

    await expect(createEvent({ eventSeriesId: "s1", name: "Eine mehr" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  // No query is issued at all: the whole list is in the document the write already reads.
  it("decides uniqueness without reading another event series", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2", { events: ["Montafon"] });
    firestore.queryDocumentsRead = 0;

    await createEvent({ eventSeriesId: "s1", name: "Montafon" });

    expect(firestore.queryDocumentsRead).toBe(0);
  });
});

describe("event names are unique within their event series", () => {
  it("refuses a duplicate name in the same event series", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });

    await expect(createEvent({ eventSeriesId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedEvents("s1")).toEqual(["Montafon"]);
  });

  it("compares names ignoring case and surrounding whitespace", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });

    await expect(createEvent({ eventSeriesId: "s1", name: " MONTAFON " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows the same event name in a different event series", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });
    seedEventSeries("s2");

    await expect(createEvent({ eventSeriesId: "s2", name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
    expect(storedEvents("s2")).toEqual(["Montafon"]);
  });

  it("refuses to rename an event onto a sibling's name", async () => {
    seedEventSeries("s1", { events: ["Montafon", "Lech"] });

    await expect(updateEvent("s1", "Lech", { name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storedEvents("s1")).toEqual(["Montafon", "Lech"]);
  });

  it("lets an event keep its own name", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });

    await expect(updateEvent("s1", "Montafon", { name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
  });

  it("allows renaming onto a name used only in another event series", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });
    seedEventSeries("s2", { events: ["Lech"] });

    await expect(updateEvent("s1", "Montafon", { name: "Lech" })).resolves.toMatchObject({
      name: "Lech",
    });
    expect(storedEvents("s1")).toEqual(["Lech"]);
  });
});

describe("updateEvent", () => {
  it("renames the event in place, keeping the teacher's order", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2", "Woche 3"] });

    await updateEvent("s1", "Woche 2", { name: "Semesterwoche" });

    expect(storedEvents("s1")).toEqual(["Woche 1", "Semesterwoche", "Woche 3"]);
  });

  it("finds the event by name, ignoring case and surrounding whitespace", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });

    await updateEvent("s1", "  WOCHE 1 ", { name: "Woche eins" });

    expect(storedEvents("s1")).toEqual(["Woche eins"]);
  });

  it("rejects a blank name", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });

    await expect(updateEvent("s1", "Montafon", { name: "   " })).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("reports a name the event series does not offer as not found", async () => {
    seedEventSeries("s1", { events: ["Montafon"] });

    await expect(updateEvent("s1", "Lech", { name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  // The assignment is the name itself, so it has to follow the rename or it names nothing.
  it("carries the students assigned to it over to the new name", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedRegistration("m1", "s1", { event: "Woche 1" });
    seedRegistration("m2", "s1", { event: null });

    await updateEvent("s1", "Woche 1", { name: "Semesterwoche" });

    expect(firestore.get("registrations", "m1")).toMatchObject({ event: "Semesterwoche" });
    expect(firestore.get("registrations", "m2")).toMatchObject({ event: null });
  });

  it("leaves the registrations of another event series alone", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedEventSeries("s2", { events: ["Woche 1"] });
    seedRegistration("other", "s2", { event: "Woche 1" });

    await updateEvent("s1", "Woche 1", { name: "Semesterwoche" });

    expect(firestore.get("registrations", "other")).toMatchObject({ event: "Woche 1" });
  });
});

describe("reorderEvents", () => {
  it("stores the order the teacher dropped them in", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2", "Woche 3"] });

    await reorderEvents("s1", ["Woche 3", "Woche 1", "Woche 2"]);

    expect(storedEvents("s1")).toEqual(["Woche 3", "Woche 1", "Woche 2"]);
  });

  it("refuses an order that is not a permutation of the list as it stands", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2"] });

    await expect(reorderEvents("s1", ["Woche 1"])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storedEvents("s1")).toEqual(["Woche 1", "Woche 2"]);
  });

  it("refuses an order naming an event this series does not hold", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2"] });

    await expect(reorderEvents("s1", ["Woche 1", "Montafon"])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(storedEvents("s1")).toEqual(["Woche 1", "Woche 2"]);
  });

  it("leaves one event series' order untouched by another's", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2"] });
    seedEventSeries("s2", { events: ["Woche 1", "Woche 2"] });

    await reorderEvents("s1", ["Woche 2", "Woche 1"]);

    expect(storedEvents("s2")).toEqual(["Woche 1", "Woche 2"]);
  });
});

describe("deleteEvent", () => {
  it("removes the event from the list", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2"] });

    await deleteEvent("s1", "Woche 1");

    expect(storedEvents("s1")).toEqual(["Woche 2"]);
  });

  it("reports a name the event series does not offer as not found", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });

    await expect(deleteEvent("s1", "Woche 2")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storedEvents("s1")).toEqual(["Woche 1"]);
  });

  it("unassigns every student that was assigned to it (US-4, US-12)", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedRegistration("m1", "s1", { event: "Woche 1" });
    seedRegistration("m2", "s1", { event: "Woche 1" });

    await deleteEvent("s1", "Woche 1");

    expect(firestore.get("registrations", "m1")).toMatchObject({ event: null });
    expect(firestore.get("registrations", "m2")).toMatchObject({ event: null });
  });

  it("keeps the registration records themselves", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedRegistration("m1", "s1", { event: "Woche 1" });

    await deleteEvent("s1", "Woche 1");

    expect(firestore.count("registrations")).toBe(1);
  });

  it("changes no answer other than the assignment", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedRegistration("m1", "s1", {
      event: "Woche 1",
      skillLevel: "Fortgeschritten",
      isAttendingSportsWeek: true,
    });

    await deleteEvent("s1", "Woche 1");

    expect(firestore.get("registrations", "m1")).toEqual({
      userId: "u-m1",
      eventSeriesId: "s1",
      event: null,
      skillLevel: "Fortgeschritten",
      isAttendingSportsWeek: true,
    });
  });

  it("leaves records assigned to another event untouched", async () => {
    seedEventSeries("s1", { events: ["Woche 1", "Woche 2"] });
    seedRegistration("m1", "s1", { event: "Woche 1" });
    seedRegistration("keep", "s1", { event: "Woche 2" });

    await deleteEvent("s1", "Woche 1");

    expect(firestore.get("registrations", "keep")).toMatchObject({ event: "Woche 2" });
  });

  it("leaves the same name in another event series assigned", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    seedEventSeries("s2", { events: ["Woche 1"] });
    seedRegistration("other", "s2", { event: "Woche 1" });

    await deleteEvent("s1", "Woche 1");

    expect(firestore.get("registrations", "other")).toMatchObject({ event: "Woche 1" });
    expect(storedEvents("s2")).toEqual(["Woche 1"]);
  });

  it("chunks the unassignment into batches no larger than the Firestore limit", async () => {
    seedEventSeries("s1", { events: ["Woche 1"] });
    for (let index = 0; index < 1200; index += 1) {
      seedRegistration(`m${index}`, "s1", { event: "Woche 1" });
    }

    await deleteEvent("s1", "Woche 1");

    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    const stillAssigned = Object.values(firestore.docs("registrations")).filter(
      (record) => record.event === "Woche 1",
    );
    expect(stillAssigned).toHaveLength(0);
  });
});
