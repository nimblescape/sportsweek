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

const { createEvent, updateEvent, deleteEvent } = await import("./event-service");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

function seedSeason(id: string, overrides: Record<string, unknown> = {}) {
  firestore.seed("seasons", id, {
    name: `Saison ${id}`,
    isActive: false,
    isArchived: false,
    hasStudentData: false,
    ...overrides,
  });
}

/** Mirrors createEvent: an event and the reservation that holds its name within its season. */
function seedEvent(id: string, seasonId: string, name: string) {
  firestore.seed("events", id, { seasonId, name });
  firestore.seed("reservedNames", `events:${seasonId}|${name.trim().toLowerCase()}`, {
    scope: `events:${seasonId}`,
    name,
    ownerId: id,
  });
}

describe("createEvent", () => {
  it("stores the event under its season", async () => {
    seedSeason("s1");

    const event = await createEvent({ seasonId: "s1", name: "Montafon" });

    expect(firestore.get("events", event.id)).toEqual({
      seasonId: "s1",
      name: "Montafon",
      position: 0,
    });
  });

  it("trims the name", async () => {
    seedSeason("s1");

    const event = await createEvent({ seasonId: "s1", name: "  Lech  " });

    expect(event.name).toBe("Lech");
  });

  it("rejects a blank name", async () => {
    seedSeason("s1");

    await expect(createEvent({ seasonId: "s1", name: " " })).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("events")).toBe(0);
  });

  it("refuses to attach an event to a season that does not exist", async () => {
    await expect(createEvent({ seasonId: "ghost", name: "Montafon" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(firestore.count("events")).toBe(0);
  });

  it("refuses to add an event to an archived season", async () => {
    seedSeason("s1", { isArchived: true });

    await expect(createEvent({ seasonId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("updateEvent", () => {
  it("renames an event", async () => {
    seedSeason("s1");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await updateEvent("e1", { name: "Montafon Nord" });

    expect(firestore.get("events", "e1")).toEqual({ seasonId: "s1", name: "Montafon Nord" });
  });

  it("rejects a blank name", async () => {
    seedSeason("s1");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(updateEvent("e1", { name: "   " })).rejects.toBeInstanceOf(ServiceError);
  });

  it("reports a missing event as not found", async () => {
    await expect(updateEvent("ghost", { name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteEvent", () => {
  it("deletes the event", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await deleteEvent("e1");

    expect(firestore.get("events", "e1")).toBeUndefined();
  });

  it("reports a missing event as not found", async () => {
    await expect(deleteEvent("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unassigns every student that was assigned to it", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1", eventId: "e1" });
    firestore.seed("studentMasterData", "m2", { seasonId: "s1", studentId: "u2", eventId: "e1" });

    await deleteEvent("e1");

    expect(firestore.get("studentMasterData", "m1")).toMatchObject({ eventId: null });
    expect(firestore.get("studentMasterData", "m2")).toMatchObject({ eventId: null });
  });

  it("keeps the student master data records themselves", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1", eventId: "e1" });

    await deleteEvent("e1");

    expect(firestore.count("studentMasterData")).toBe(1);
  });

  it("changes no field other than eventId", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("studentMasterData", "m1", {
      seasonId: "s1",
      studentId: "u1",
      eventId: "e1",
      skillLevel: "Fortgeschritten",
      isAttending: true,
    });

    await deleteEvent("e1");

    expect(firestore.get("studentMasterData", "m1")).toEqual({
      seasonId: "s1",
      studentId: "u1",
      eventId: null,
      skillLevel: "Fortgeschritten",
      isAttending: true,
    });
  });

  it("leaves records assigned to other events untouched", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("studentMasterData", "m1", { seasonId: "s1", studentId: "u1", eventId: "e1" });
    firestore.seed("studentMasterData", "keep", {
      seasonId: "s1",
      studentId: "u2",
      eventId: "other",
    });

    await deleteEvent("e1");

    expect(firestore.get("studentMasterData", "keep")).toMatchObject({ eventId: "other" });
  });

  it("chunks the unassignment into batches no larger than the Firestore limit", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    for (let index = 0; index < 1200; index += 1) {
      firestore.seed("studentMasterData", `m${index}`, {
        seasonId: "s1",
        studentId: `u${index}`,
        eventId: "e1",
      });
    }

    await deleteEvent("e1");

    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    const stillAssigned = Object.values(firestore.docs("studentMasterData")).filter(
      (record) => record.eventId === "e1",
    );
    expect(stillAssigned).toHaveLength(0);
  });
});

describe("event names are unique within their season", () => {
  it("refuses a duplicate name in the same season", async () => {
    seedSeason("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(createEvent({ seasonId: "s1", name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.count("events")).toBe(1);
  });

  it("compares names ignoring case and surrounding whitespace", async () => {
    seedSeason("s1");
    seedEvent("e1", "s1", "Montafon");

    await expect(createEvent({ seasonId: "s1", name: " MONTAFON " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows the same event name in a different season", async () => {
    seedSeason("s1");
    seedSeason("s2");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(createEvent({ seasonId: "s2", name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
  });

  it("refuses to rename an event onto a sibling's name", async () => {
    seedSeason("s1");
    seedEvent("e1", "s1", "Montafon");
    seedEvent("e2", "s1", "Lech");

    await expect(updateEvent("e2", { name: "Montafon" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(firestore.get("events", "e2")).toMatchObject({ name: "Lech" });
  });

  it("lets an event keep its own name", async () => {
    seedSeason("s1");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(updateEvent("e1", { name: "Montafon" })).resolves.toMatchObject({
      name: "Montafon",
    });
  });

  it("allows renaming onto a name used only in another season", async () => {
    seedSeason("s1");
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });
    firestore.seed("events", "other", { seasonId: "s2", name: "Lech" });

    await expect(updateEvent("e1", { name: "Lech" })).resolves.toMatchObject({ name: "Lech" });
  });
});
