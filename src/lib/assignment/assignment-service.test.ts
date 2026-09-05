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
const { registrationPath } = await import("@/lib/registration/registration");
const { ServiceError } = await import("@/lib/service-error");

const ANNA = "uidAnna";
const BENE = "bene@student.htldornbirn.at";
const REGISTRATIONS = registrationPath("s1");

/** The series is named by the path the teacher is working in (Q8), so every call carries it. */
const assign = (studentUids: readonly string[], event: string | null) =>
  assignStudents("s1", studentUids, event);

function seedRecord(studentUid: string, fields: Record<string, unknown> = {}) {
  firestore.seed(REGISTRATIONS, studentUid, {
    studentUid,
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
      isOpenToStudents: true,
      hasRegistrations: true,
      events: [{ name: "Woche 1" }, { name: "Woche 2" }],
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
      events: [{ name: "Gardasee" }],
    }),
  );
  seedRecord(ANNA);
  seedRecord(BENE);
});

const eventOf = (id: string) => firestore.get(REGISTRATIONS, id)?.event;

describe("assignStudents", () => {
  it("writes the event onto every record it was given", async () => {
    await assign([ANNA, BENE], "Woche 1");

    expect(eventOf(ANNA)).toBe("Woche 1");
    expect(eventOf(BENE)).toBe("Woche 1");
  });

  it("unassigns a student when no event is named", async () => {
    seedRecord(ANNA, { event: "Woche 1" });

    await assign([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("moves a student to another event by unassigning and assigning again", async () => {
    await assign([ANNA], "Woche 1");

    await assign([ANNA], null);
    await assign([ANNA], "Woche 2");

    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  // The assignment is the name itself (US-11), so it has to be the name the series spells.
  it("finds the event by name, ignoring case and surrounding whitespace", async () => {
    await assign([ANNA], "  wOcHe 1 ");

    expect(eventOf(ANNA)).toBe("Woche 1");
  });

  it("changes nothing but the assignment", async () => {
    await assign([ANNA], "Woche 1");

    expect(firestore.get(REGISTRATIONS, ANNA)).toMatchObject({
      studentUid: ANNA,
      isAttendingSportsWeek: true,
    });
  });

  it("refuses a student who is not attending, who cannot be assigned at all (US-11)", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false });

    await expect(assign([ANNA], "Woche 1")).rejects.toBeInstanceOf(ServiceError);
    expect(eventOf(ANNA)).toBeNull();
  });

  it("still unassigns a student who is not attending, so nothing can get stuck", async () => {
    seedRecord(ANNA, { isAttendingSportsWeek: false, event: "Woche 1" });

    await assign([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses an event that does not exist", async () => {
    await expect(assign([ANNA], "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an event of another event series, so an event series cannot borrow one", async () => {
    await expect(assign([ANNA], "Gardasee")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("assigns the named series' own event where two series share a name", async () => {
    firestore.seed(
      "eventSeries",
      "s0",
      storedEventSeries({
        name: "2025",
        isArchived: true,
        hasRegistrations: true,
        position: 1,
        events: [{ name: "woche 1" }],
      }),
    );

    await assign([ANNA], "Woche 1");

    expect(eventOf(ANNA)).toBe("Woche 1");
  });

  it("refuses a registration that does not exist", async () => {
    await expect(assign(["ghost"], "Woche 1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /** The path is derived from the named series, so another series' record is out of reach. */
  it("refuses a student whose only registration is in another event series", async () => {
    const CLARA = "clara@student.htldornbirn.at";
    firestore.seed(registrationPath("s0"), CLARA, {
      studentUid: CLARA,
      event: null,
      isAttendingSportsWeek: true,
    });

    await expect(assign([CLARA], "Woche 1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(firestore.get(registrationPath("s0"), CLARA)).toMatchObject({ event: null });
  });

  it("writes nothing at all when one of the records is refused", async () => {
    seedRecord(BENE, { isAttendingSportsWeek: false });

    await expect(assign([ANNA, BENE], "Woche 1")).rejects.toBeInstanceOf(ServiceError);

    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses to work in an event series that is not there", async () => {
    await expect(assignStudents("ghost", [ANNA], null)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  /** Archiving is what makes a series read-only, so there is no screen to assign from (US-19). */
  it("refuses to work in an archived event series", async () => {
    await expect(assignStudents("s0", [ANNA], null)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /**
   * One round trip per student, taken one after the other, is seconds of waiting for a single
   * drop once a whole class is moved at once.
   */
  it("reads every record at once rather than one round trip after another", async () => {
    const CLARA = "clara@student.htldornbirn.at";
    seedRecord(CLARA);

    const started: string[] = [];
    let startedWhenFirstReturned = 0;

    const read = FakeDocumentReference.prototype.get;
    vi.spyOn(FakeDocumentReference.prototype, "get").mockImplementation(async function (
      this: FakeDocumentReference,
    ) {
      const isRecord = this.collectionPath === REGISTRATIONS;
      if (isRecord) started.push(this.id);

      const snapshot = await read.call(this);
      if (isRecord && startedWhenFirstReturned === 0) startedWhenFirstReturned = started.length;
      return snapshot;
    });

    await assign([ANNA, BENE, CLARA], "Woche 1");

    expect(startedWhenFirstReturned).toBe(3);
    vi.restoreAllMocks();
  });
});
