/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDocumentReference, FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";

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
    event: null,
    isAttendingSportsWeek: true,
    ...fields,
  });
}

beforeEach(() => {
  firestore.reset();
  firestore.seed(
    "eventSeries",
    "s1",
    storedEventSeries({
      name: "2026",
      isActive: true,
      hasRegistrations: true,
      events: ["Woche 1", "Woche 2"],
    }),
  );
  firestore.seed(
    "eventSeries",
    "s0",
    storedEventSeries({
      name: "2025",
      isArchived: true,
      hasRegistrations: true,
      position: 1,
      events: ["Gardasee"],
    }),
  );
  seedRecord(ANNA);
  seedRecord(BENE);
});

const eventOf = (id: string) => firestore.get("registrations", id)?.event;

describe("assignStudents", () => {
  it("writes the event onto every record it was given", async () => {
    await assignStudents([ANNA, BENE], "Woche 1");

    expect(eventOf(ANNA)).toBe("Woche 1");
    expect(eventOf(BENE)).toBe("Woche 1");
  });

  it("unassigns a student when no event is named", async () => {
    seedRecord(ANNA, { event: "Woche 1" });

    await assignStudents([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("moves a student to another event by unassigning and assigning again", async () => {
    await assignStudents([ANNA], "Woche 1");

    await assignStudents([ANNA], null);
    await assignStudents([ANNA], "Woche 2");

    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  // The assignment is the name itself (US-11), so it has to be the name the series spells.
  it("finds the event by name, ignoring case and surrounding whitespace", async () => {
    await assignStudents([ANNA], "  wOcHe 1 ");

    expect(eventOf(ANNA)).toBe("Woche 1");
  });

  it("changes nothing but the assignment", async () => {
    await assignStudents([ANNA], "Woche 1");

    expect(firestore.get("registrations", ANNA)).toMatchObject({
      userId: "anna@student.htldornbirn.at",
      eventSeriesId: "s1",
      isAttendingSportsWeek: true,
    });
  });

  it("refuses a student who is not attending, who cannot be assigned at all (US-11)", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false });

    await expect(assignStudents([ANNA], "Woche 1")).rejects.toBeInstanceOf(ServiceError);
    expect(eventOf(ANNA)).toBeNull();
  });

  it("still unassigns a student who is not attending, so nothing can get stuck", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false, event: "Woche 1" });

    await assignStudents([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses an event that does not exist", async () => {
    await expect(assignStudents([ANNA], "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an event of another event series, so an event series cannot borrow one", async () => {
    await expect(assignStudents([ANNA], "Gardasee")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("assigns the active event series' own event where two series share a name", async () => {
    firestore.seed(
      "eventSeries",
      "s0",
      storedEventSeries({
        name: "2025",
        isArchived: true,
        hasRegistrations: true,
        position: 1,
        events: ["woche 1"],
      }),
    );

    await assignStudents([ANNA], "Woche 1");

    expect(eventOf(ANNA)).toBe("Woche 1");
  });

  it("refuses a registration that does not exist", async () => {
    await expect(assignStudents(["ghost"], "Woche 1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a registration of an event series that is no longer the active one", async () => {
    firestore.seed("registrations", "s0__anna@student.htldornbirn.at", {
      userId: "anna@student.htldornbirn.at",
      eventSeriesId: "s0",
      event: null,
      isAttendingSportsWeek: true,
    });

    await expect(
      assignStudents(["s0__anna@student.htldornbirn.at"], "Woche 1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("writes nothing at all when one of the records is refused", async () => {
    seedRecord(BENE, { isAttendingSportsWeek: false });

    await expect(assignStudents([ANNA, BENE], "Woche 1")).rejects.toBeInstanceOf(ServiceError);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses to work while no event series is active", async () => {
    firestore.seed(
      "eventSeries",
      "s1",
      storedEventSeries({ name: "2026", hasRegistrations: true }),
    );

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

    await assignStudents([ANNA, BENE, CLARA], "Woche 1");

    expect(startedWhenFirstReturned).toBe(3);
    vi.restoreAllMocks();
  });
});
