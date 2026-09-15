/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDocumentReference, FakeFirestore } from "@/test/fake-firestore";
import { event, storedEventSeries } from "@/test/event-series";
import { studentRecord } from "@/test/roster-student";
import { asUid } from "@/lib/schemas/common";
import type { Registration } from "@/lib/schemas/registration";

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

function seedRecord(studentUid: string, fields: Partial<Registration> = {}) {
  // The id is the document's own, so it is not among the fields stored under it.
  const stored: Partial<Registration> = studentRecord({
    studentUid: asUid(studentUid),
    event: null,
    ...fields,
  });
  delete stored.id;
  firestore.seed(REGISTRATIONS, studentUid, stored);
}

beforeEach(() => {
  firestore.reset();
  firestore.seed(
    "eventSeries",
    "s1",
    storedEventSeries({
      name: "2026",
      hasRegistrations: true,
      events: [event("Woche 1"), event("Woche 2")],
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
      events: [event("Gardasee")],
    }),
  );
  seedRecord(ANNA);
  seedRecord(BENE);
});

const eventOf = (id: string) => firestore.get(REGISTRATIONS, id)?.event;

/** "Woche 2" names a program list of its own, which is what makes the series register in two steps. */
function seedTwoStepSeries() {
  firestore.seed(
    "eventSeries",
    "s1",
    storedEventSeries({
      name: "2026",
      hasRegistrations: true,
      programs: [{ name: "Ski", requiredEquipment: [] }],
      events: [
        event("Woche 1"),
        event("Woche 2", { programs: [{ name: "Langlauf", requiredEquipment: [] }] }),
      ],
    }),
  );
}

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
        events: [event("woche 1")],
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

/**
 * While the series is open a student may be answering Veranstaltung at the moment a teacher
 * moves them, and neither of them would ever know. Closing is the teacher's own act, so the
 * write is refused rather than the series closed on their behalf.
 */
describe("assignStudents — while the event series is open to students", () => {
  beforeEach(() => {
    firestore.seed(
      "eventSeries",
      "s1",
      storedEventSeries({
        name: "2026",
        classOptions: [{ name: "5AHIF", teacherUids: [], isOpenToStudents: true }],
        hasRegistrations: true,
        events: [event("Woche 1"), event("Woche 2")],
      }),
    );
  });

  it("refuses to assign", async () => {
    await expect(assign([ANNA], "Woche 1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBeNull();
  });

  it("refuses to unassign, so closing cannot be worked around by going backwards", async () => {
    seedRecord(ANNA, { event: "Woche 1" });

    await expect(assign([ANNA], null)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBe("Woche 1");
  });
});

describe("assignStudents — completeness", () => {
  /** Incomplete for two unrelated reasons at once is a state the board cannot tell apart. */
  it("refuses a student who has not finished answering", async () => {
    seedRecord(ANNA, { phoneNumber: null });

    await expect(assign([ANNA], "Woche 1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBeNull();
  });

  it("still unassigns one, so nobody is stuck in an event they cannot complete", async () => {
    seedRecord(ANNA, { event: "Woche 1", phoneNumber: null });

    await assign([ANNA], null);

    expect(eventOf(ANNA)).toBeNull();
  });

  /**
   * Assigning is what begins step two (US-36), so a question only the event asks cannot be
   * outstanding yet — there was no way to answer it before now. Checked fresh against what the
   * series asks before any event, rather than trusted from a mark nothing ever writes (US-13).
   */
  it("refuses a two-step registration missing a base answer, even into an event", async () => {
    seedTwoStepSeries();
    seedRecord(ANNA, { phoneNumber: null });

    await expect(assign([ANNA], "Woche 2")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBeNull();
  });

  it("allows assigning a two-step registration that has not reached its event's own question yet", async () => {
    seedTwoStepSeries();
    seedRecord(ANNA, { program: null });

    await assign([ANNA], "Woche 2");

    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  /**
   * A one-step answer is chosen against the series' own list (US-33); the event later keeping a
   * narrower list of its own is what makes the series two-step, and nothing rechecked the answer
   * against it until this assignment.
   */
  it("clears an answer no longer valid for the event a student is assigned into", async () => {
    seedTwoStepSeries();
    seedRecord(ANNA, { program: "Ski" });

    await assign([ANNA], "Woche 2");

    expect(firestore.get(REGISTRATIONS, ANNA)).toMatchObject({ event: "Woche 2", program: null });
  });

  it("keeps an answer that is still one the assigned event offers", async () => {
    seedTwoStepSeries();
    seedRecord(ANNA, { program: "Langlauf" });

    await assign([ANNA], "Woche 2");

    expect(firestore.get(REGISTRATIONS, ANNA)).toMatchObject({ program: "Langlauf" });
  });
});

/**
 * An answer drawn from an event's own list is only valid inside it, so a move would leave it
 * pointing at a list the student is no longer offered. It is refused rather than cleared.
 */
describe("assignStudents — an answer the event owns", () => {
  beforeEach(seedTwoStepSeries);

  it("refuses to move the student elsewhere", async () => {
    seedRecord(ANNA, { event: "Woche 2", program: "Langlauf" });

    await expect(assign([ANNA], "Woche 1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  it("refuses to take the event away", async () => {
    seedRecord(ANNA, { event: "Woche 2", program: "Langlauf" });

    await expect(assign([ANNA], null)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  /** A repeated drop onto the same event moves nobody, so there is nothing to invalidate. */
  it("allows assigning the same event again", async () => {
    seedRecord(ANNA, { event: "Woche 2", program: "Langlauf" });

    await assign([ANNA], "Woche 2");

    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  it("moves a student whose event names no list of its own", async () => {
    seedRecord(ANNA, { event: "Woche 1", program: "Ski" });

    await assign([ANNA], "Woche 2");

    expect(eventOf(ANNA)).toBe("Woche 2");
  });

  /** Nothing is owed until the question is answered, so a move is still free until then. */
  it("moves a student who has not answered the event's own question yet", async () => {
    seedRecord(ANNA, { event: "Woche 2", program: null });

    await assign([ANNA], "Woche 1");

    expect(eventOf(ANNA)).toBe("Woche 1");
  });
});
