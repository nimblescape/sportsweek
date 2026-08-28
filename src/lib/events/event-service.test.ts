/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { createEvent, updateEvent, deleteEvent } = await import("./event-service");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

function seedEventSeries(id: string, overrides: Record<string, unknown> = {}) {
  firestore.seed("eventSeries", id, storedEventSeries({ name: `Eventreihe ${id}`, ...overrides }));
}

/** Mirrors createEvent: the name key is derived, so it is what the uniqueness query compares. */
function seedEvent(id: string, eventSeriesId: string, name: string, position = 0) {
  firestore.seed("events", id, {
    eventSeriesId,
    name,
    nameKey: name.trim().toLocaleLowerCase("de-AT"),
    position,
  });
}

describe("createEvent", () => {
  it("stores the event under its event series", async () => {
    seedEventSeries("s1");

    const event = await createEvent({ eventSeriesId: "s1", name: "Montafon" });

    expect(firestore.get("events", event.id)).toEqual({
      eventSeriesId: "s1",
      name: "Montafon",
      nameKey: "montafon",
      position: 0,
    });
  });

  it("trims the name", async () => {
    seedEventSeries("s1");

    const event = await createEvent({ eventSeriesId: "s1", name: "  Lech  " });

    expect(event.name).toBe("Lech");
  });

  // Only this event series' events decide the position, and only how many of them there are.
  it("counts the event series's existing events rather than downloading them", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");
    seedEvent("e2", "s1", "Lech");
    seedEvent("e3", "s2", "Silvretta");
    firestore.queryDocumentsRead = 0;

    const event = await createEvent({ eventSeriesId: "s1", name: "Damuels" });

    expect(firestore.get("events", event.id)).toMatchObject({ position: 2 });
    expect(firestore.queryDocumentsRead).toBe(0);
  });

  it("rejects a blank name", async () => {
    seedEventSeries("s1");

    await expect(createEvent({ eventSeriesId: "s1", name: " " })).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(firestore.count("events")).toBe(0);
  });

  it("refuses to attach an event to an event series that does not exist", async () => {
    await expect(createEvent({ eventSeriesId: "ghost", name: "Montafon" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(firestore.count("events")).toBe(0);
  });

  it("refuses to add an event to an archived event series", async () => {
    seedEventSeries("s1", { isArchived: true });

    await expect(createEvent({ eventSeriesId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("updateEvent", () => {
  it("renames an event, carrying the key the uniqueness query compares on", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");

    await updateEvent("e1", { name: "Montafon Nord" });

    expect(firestore.get("events", "e1")).toEqual({
      eventSeriesId: "s1",
      name: "Montafon Nord",
      nameKey: "montafon nord",
      position: 0,
    });
  });

  it("rejects a blank name", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(updateEvent("e1", { name: "   " })).rejects.toBeInstanceOf(ServiceError);
  });

  it("reports a missing event as not found", async () => {
    await expect(updateEvent("ghost", { name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteEvent", () => {
  it("deletes the event", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });

    await deleteEvent("e1");

    expect(firestore.get("events", "e1")).toBeUndefined();
  });

  it("reports a missing event as not found", async () => {
    await expect(deleteEvent("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unassigns every student that was assigned to it", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });
    firestore.seed("registrations", "m1", { eventSeriesId: "s1", studentId: "u1", eventId: "e1" });
    firestore.seed("registrations", "m2", { eventSeriesId: "s1", studentId: "u2", eventId: "e1" });

    await deleteEvent("e1");

    expect(firestore.get("registrations", "m1")).toMatchObject({ eventId: null });
    expect(firestore.get("registrations", "m2")).toMatchObject({ eventId: null });
  });

  it("keeps the registration records themselves", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });
    firestore.seed("registrations", "m1", { eventSeriesId: "s1", studentId: "u1", eventId: "e1" });

    await deleteEvent("e1");

    expect(firestore.count("registrations")).toBe(1);
  });

  it("changes no field other than eventId", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });
    firestore.seed("registrations", "m1", {
      eventSeriesId: "s1",
      studentId: "u1",
      eventId: "e1",
      skillLevel: "Fortgeschritten",
      isAttending: true,
    });

    await deleteEvent("e1");

    expect(firestore.get("registrations", "m1")).toEqual({
      eventSeriesId: "s1",
      studentId: "u1",
      eventId: null,
      skillLevel: "Fortgeschritten",
      isAttending: true,
    });
  });

  it("leaves records assigned to other events untouched", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });
    firestore.seed("registrations", "m1", { eventSeriesId: "s1", studentId: "u1", eventId: "e1" });
    firestore.seed("registrations", "keep", {
      eventSeriesId: "s1",
      studentId: "u2",
      eventId: "other",
    });

    await deleteEvent("e1");

    expect(firestore.get("registrations", "keep")).toMatchObject({ eventId: "other" });
  });

  it("chunks the unassignment into batches no larger than the Firestore limit", async () => {
    firestore.seed("events", "e1", { eventSeriesId: "s1", name: "Montafon" });
    for (let index = 0; index < 1200; index += 1) {
      firestore.seed("registrations", `m${index}`, {
        eventSeriesId: "s1",
        studentId: `u${index}`,
        eventId: "e1",
      });
    }

    await deleteEvent("e1");

    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    const stillAssigned = Object.values(firestore.docs("registrations")).filter(
      (record) => record.eventId === "e1",
    );
    expect(stillAssigned).toHaveLength(0);
  });
});

describe("event names are unique within their event series", () => {
  it("refuses a duplicate name in the same event series", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(createEvent({ eventSeriesId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.count("events")).toBe(1);
  });

  it("compares names ignoring case and surrounding whitespace", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(createEvent({ eventSeriesId: "s1", name: " MONTAFON " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows the same event name in a different event series", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2");
    seedEvent("e1", "s1", "Montafon");

    await expect(createEvent({ eventSeriesId: "s2", name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
  });

  it("refuses to rename an event onto a sibling's name", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");
    seedEvent("e2", "s1", "Lech");

    await expect(updateEvent("e2", { name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("events", "e2")).toMatchObject({ name: "Lech" });
  });

  it("lets an event keep its own name", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(updateEvent("e1", { name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
  });

  it("allows renaming onto a name used only in another event series", async () => {
    seedEventSeries("s1");
    seedEvent("e1", "s1", "Montafon");
    seedEvent("other", "s2", "Lech");

    await expect(updateEvent("e1", { name: "Lech" })).resolves.toMatchObject({ name: "Lech" });
  });
});
