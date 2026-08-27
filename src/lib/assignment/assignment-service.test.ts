/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDocumentReference, FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { assignStudents } = await import("./assignment-service");
const { ServiceError } = await import("@/lib/service-error");

const ANNA = "s1__anna@student.htldornbirn.at";
const BENE = "s1__bene@student.htldornbirn.at";

function seedRecord(id: string, fields: Record<string, unknown> = {}) {
  firestore.seed("registrations", id, {
    userId: id.split("__")[1],
    eventSeriesId: "s1",
    eventId: null,
    isAttendingSportsWeek: true,
    ...fields,
  });
}

beforeEach(() => {
  firestore.reset();
  firestore.seed("eventSeries", "s1", {
    name: "2026",
    isActive: true,
    isArchived: false,
    hasRegistrations: true,
    position: 0,
  });
  firestore.seed("eventSeries", "s0", {
    name: "2025",
    isActive: false,
    isArchived: true,
    hasRegistrations: true,
    position: 1,
  });
  firestore.seed("events", "event1", { eventSeriesId: "s1", name: "Montafon", position: 0 });
  firestore.seed("events", "event2", { eventSeriesId: "s0", name: "Gardasee", position: 0 });
  seedRecord(ANNA);
  seedRecord(BENE);
});

const eventOf = (id: string) => firestore.get("registrations", id)?.eventId;

describe("assignStudents", () => {
  it("writes the event onto every record it was given", async () => {
    await assignStudents([ANNA, BENE], "event1");

    expect(eventOf(ANNA)).toBe("event1");
    expect(eventOf(BENE)).toBe("event1");
  });

  it("unassigns a student when no event is named", async () => {
    seedRecord(ANNA, { eventId: "event1" });

    await assignStudents([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("moves a student to another event by unassigning and assigning again", async () => {
    firestore.seed("events", "event3", { eventSeriesId: "s1", name: "Bregenzerwald", position: 1 });
    await assignStudents([ANNA], "event1");

    await assignStudents([ANNA], null);
    await assignStudents([ANNA], "event3");

    expect(eventOf(ANNA)).toBe("event3");
  });

  it("changes nothing but the assignment", async () => {
    await assignStudents([ANNA], "event1");

    expect(firestore.get("registrations", ANNA)).toMatchObject({
      userId: "anna@student.htldornbirn.at",
      eventSeriesId: "s1",
      isAttendingSportsWeek: true,
    });
  });

  it("refuses a student who is not attending, who cannot be assigned at all (US-11)", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false });

    await expect(assignStudents([ANNA], "event1")).rejects.toBeInstanceOf(ServiceError);
    expect(eventOf(ANNA)).toBeNull();
  });

  it("still unassigns a student who is not attending, so nothing can get stuck", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false, eventId: "event1" });

    await assignStudents([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses an event that does not exist", async () => {
    await expect(assignStudents([ANNA], "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an event of another event series, so an event series cannot borrow one", async () => {
    await expect(assignStudents([ANNA], "event2")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a registration that does not exist", async () => {
    await expect(assignStudents(["ghost"], "event1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a registration of an event series that is no longer the active one", async () => {
    firestore.seed("registrations", "s0__anna@student.htldornbirn.at", {
      userId: "anna@student.htldornbirn.at",
      eventSeriesId: "s0",
      eventId: null,
      isAttendingSportsWeek: true,
    });

    await expect(
      assignStudents(["s0__anna@student.htldornbirn.at"], "event1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("writes nothing at all when one of the records is refused", async () => {
    seedRecord(BENE, { isAttendingSportsWeek: false });

    await expect(assignStudents([ANNA, BENE], "event1")).rejects.toBeInstanceOf(ServiceError);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses to work while no event series is active", async () => {
    firestore.seed("eventSeries", "s1", {
      name: "2026",
      isActive: false,
      isArchived: false,
      hasRegistrations: true,
      position: 0,
    });

    await expect(assignStudents([ANNA], null)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /**
   * One round trip per student, taken one after the other, is seconds of waiting for a single
   * drop once a whole class is moved at once.
   */
  it("reads every record at once rather than one round trip after another", async () => {
    const CLARA = "s1__clara@student.htldornbirn.at";
    seedRecord(CLARA);

    const started: string[] = [];
    let startedWhenFirstReturned = 0;

    const read = FakeDocumentReference.prototype.get;
    vi.spyOn(FakeDocumentReference.prototype, "get").mockImplementation(async function (
      this: FakeDocumentReference,
    ) {
      const isRecord = this.collectionPath === "registrations";
      if (isRecord) started.push(this.id);

      const snapshot = await read.call(this);
      if (isRecord && startedWhenFirstReturned === 0) startedWhenFirstReturned = started.length;
      return snapshot;
    });

    await assignStudents([ANNA, BENE, CLARA], "event1");

    expect(startedWhenFirstReturned).toBe(3);
    vi.restoreAllMocks();
  });
});
