/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { assignStudents } = await import("./assignment-service");
const { ServiceError } = await import("@/lib/service-error");

const ANNA = "s1__anna@student.htldornbirn.at";
const BENE = "s1__bene@student.htldornbirn.at";

function seedRecord(id: string, fields: Record<string, unknown> = {}) {
  firestore.seed("studentMasterData", id, {
    userId: id.split("__")[1],
    seasonId: "s1",
    eventId: null,
    isAttendingSportsWeek: true,
    ...fields,
  });
}

beforeEach(() => {
  firestore.reset();
  firestore.seed("seasons", "s1", {
    name: "2026",
    isActive: true,
    isArchived: false,
    hasStudentData: true,
    position: 0,
  });
  firestore.seed("seasons", "s0", {
    name: "2025",
    isActive: false,
    isArchived: true,
    hasStudentData: true,
    position: 1,
  });
  firestore.seed("events", "event1", { seasonId: "s1", name: "Montafon", position: 0 });
  firestore.seed("events", "event2", { seasonId: "s0", name: "Gardasee", position: 0 });
  seedRecord(ANNA);
  seedRecord(BENE);
});

const eventOf = (id: string) => firestore.get("studentMasterData", id)?.eventId;

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
    firestore.seed("events", "event3", { seasonId: "s1", name: "Bregenzerwald", position: 1 });
    await assignStudents([ANNA], "event1");

    await assignStudents([ANNA], null);
    await assignStudents([ANNA], "event3");

    expect(eventOf(ANNA)).toBe("event3");
  });

  it("changes nothing but the assignment", async () => {
    await assignStudents([ANNA], "event1");

    expect(firestore.get("studentMasterData", ANNA)).toMatchObject({
      userId: "anna@student.htldornbirn.at",
      seasonId: "s1",
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

  it("refuses an event of another season, so a season cannot borrow one", async () => {
    await expect(assignStudents([ANNA], "event2")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a registration that does not exist", async () => {
    await expect(assignStudents(["ghost"], "event1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a registration of a season that is no longer the active one", async () => {
    firestore.seed("studentMasterData", "s0__anna@student.htldornbirn.at", {
      userId: "anna@student.htldornbirn.at",
      seasonId: "s0",
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

  it("refuses to work while no season is active", async () => {
    firestore.seed("seasons", "s1", {
      name: "2026",
      isActive: false,
      isArchived: false,
      hasStudentData: true,
      position: 0,
    });

    await expect(assignStudents([ANNA], null)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
