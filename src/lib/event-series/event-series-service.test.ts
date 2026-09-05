/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import { registrationPath } from "@/lib/registration/registration";
import { savedReportPath } from "@/lib/report/saved-reports";
import { ARCHIVE_OPEN_HINT } from "@/lib/event-series/event-series-state";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { createEventSeries, updateEventSeries, deleteEventSeries, resolveSelectedEventSeriesId } =
  await import("./event-series-service");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

/** Mirrors createEventSeries: the name key is derived, so nothing else holds the name (US-4). */
function seedEventSeries(id: string, overrides: Record<string, unknown> = {}) {
  firestore.seed("eventSeries", id, storedEventSeries({ name: `Eventreihe ${id}`, ...overrides }));
}

describe("createEventSeries", () => {
  it("stores a new event series as neither archived nor open", async () => {
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

/**
 * A new series begins with the setup a teacher keeps for exactly that purpose (US-22): blank, or
 * copied from any event series the school still has, archived or not.
 */
describe("createEventSeries — from a source", () => {
  const lists = {
    events: [{ name: "Woche 1" }, { name: "Woche 2" }],
    classOptions: ["5AHIF", "5BHIF"],
    programs: [
      { name: "Ski", requiredEquipment: ["Ski", "Helm"] },
      { name: "Snowboard", requiredEquipment: [] },
    ],
    skillLevels: ["Anfänger:in", "Profi"],
    seasonPassOptions: ["Kein Skipass"],
    busPickupPoints: ["HTL Dornbirn"],
    foodOptions: ["Esse alles"],
  };

  beforeEach(() => firestore.seed("eventSeries", "source", storedEventSeries({ ...lists })));

  it("takes the seven lists whole, in their order, with each program's equipment", async () => {
    const copy = await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "source" });

    expect(copy).toMatchObject(lists);
  });

  it("takes no registrations, no archive state and no invitation link", async () => {
    firestore.seed("eventSeries", "archived", storedEventSeries({ name: "Alt", isArchived: true }));
    firestore.seed(registrationPath("archived"), "m1", { studentUid: "u1" });
    firestore.seed("invitations", "tok", { eventSeriesId: "archived", class: "5AHIF" });

    const copy = await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "archived" });

    expect(copy).toMatchObject({ isArchived: false, hasRegistrations: false });
    expect(firestore.count(registrationPath(copy.id))).toBe(0);
    expect(firestore.docs("invitations").tok).toMatchObject({ eventSeriesId: "archived" });
  });

  /** Archiving would be a one-way door otherwise: its master data could never come back. */
  it("copies from an archived series, which is how its lists come back into a live one", async () => {
    firestore.seed(
      "eventSeries",
      "old",
      storedEventSeries({ name: "Alt", isArchived: true, classOptions: ["4AHIF"] }),
    );

    const copy = await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "old" });

    expect(copy.classOptions).toEqual(["4AHIF"]);
  });

  it("refuses a source that is not there rather than making a blank one", async () => {
    await expect(
      createEventSeries({ name: "Wintersportwoche 2027", sourceId: "gone" }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("eventSeries")).toBe(1);
  });

  it("takes the saved reports of its source", async () => {
    firestore.seed(savedReportPath("source"), "r1", {
      name: "5AHIF",
      filter: toggleTag(EMPTY_FILTER, "class", "5AHIF"),
      fields: ["class"],
      createdByUserId: "jane.doe@htldornbirn.at",
      position: 0,
    });

    const copy = await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "source" });

    const reports = Object.values(firestore.docs(savedReportPath(copy.id)));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ name: "5AHIF", position: 0 });
  });

  /**
   * A tag the copied lists do not offer is dropped as it is copied, exactly as US-25 drops one
   * when an item is removed — so the copy is consistent with its own lists from the moment it
   * exists, rather than opening as changed the first time anybody looks at it.
   */
  it("drops a tag its own lists do not offer, in the same write", async () => {
    firestore.seed(savedReportPath("source"), "r1", {
      name: "Alte Klasse",
      filter: toggleTag(toggleTag(EMPTY_FILTER, "class", "5AHIF"), "class", "4AHIF"),
      fields: ["class"],
      createdByUserId: "jane.doe@htldornbirn.at",
      position: 0,
    });

    const copy = await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "source" });

    const [report] = Object.values(firestore.docs(savedReportPath(copy.id)));
    expect(report.filter).toMatchObject({ tags: expect.objectContaining({ class: ["5AHIF"] }) });
  });

  it("leaves the source's own reports where they are", async () => {
    firestore.seed(savedReportPath("source"), "r1", {
      name: "5AHIF",
      filter: EMPTY_FILTER,
      fields: [],
      createdByUserId: "jane.doe@htldornbirn.at",
      position: 0,
    });

    await createEventSeries({ name: "Wintersportwoche 2027", sourceId: "source" });

    expect(firestore.count(savedReportPath("source"))).toBe(1);
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
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await updateEventSeries("s1", { isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isArchived: true });
  });

  it("self-heals a stale hasRegistrations flag while archiving, since the client relies on it", async () => {
    seedEventSeries("s1", { hasRegistrations: false });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

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

  /**
   * Closing is a decision a teacher makes on the tag of the series it concerns (US-19). Archiving
   * an open one used to make that decision for them, quietly, as a side effect of a different
   * action — and students holding the link would have found it shut without anyone shutting it.
   */
  it("refuses to archive an event series that is still open to students", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await expect(updateEventSeries("s1", { isArchived: true })).rejects.toMatchObject({
      code: "CONFLICT",
      message: ARCHIVE_OPEN_HINT,
    });
    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isArchived: false,
      isOpenToStudents: true,
    });
  });

  it("archives it once it has been closed", async () => {
    seedEventSeries("s1", { isOpenToStudents: false });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await updateEventSeries("s1", { isArchived: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({
      isArchived: true,
      isOpenToStudents: false,
    });
  });

  /** Closing and archiving in one call is the teacher doing both, in the order that makes sense. */
  it("archives an open series when the same call closes it", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await updateEventSeries("s1", { isArchived: true, isOpenToStudents: false });

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
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("eventSeries", "s1")).toBeDefined();
  });

  it("refuses to delete an open event series that still has registrations", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an unarchived event series that has no registrations", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes an open event series that has no registrations", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    seedEventSeries("s2");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("reports a missing event series as not found", async () => {
    await expect(deleteEventSeries("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /**
   * A teacher with nothing to select has a header offering nothing and a navigation bar with
   * nowhere to point. Keeping one back is what makes that state unreachable.
   */
  it("refuses to delete the only event series", async () => {
    seedEventSeries("s1");

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("eventSeries", "s1")).toBeDefined();
  });

  it("deletes one while another remains", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2");

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  /** Archiving hides a series from every screen, so an archived one is not one to fall back on. */
  it("refuses to delete the only unarchived event series", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2", { isArchived: true });

    await expect(deleteEventSeries("s1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /** The rule is about what is left to select, and an archived one was never selectable. */
  it("deletes the last archived event series, which nothing could have selected anyway", async () => {
    seedEventSeries("s1");
    seedEventSeries("s2", { isArchived: true });

    await deleteEventSeries("s2");

    expect(firestore.get("eventSeries", "s2")).toBeUndefined();
  });

  it("deletes an archived event series", async () => {
    seedEventSeries("s1", { isArchived: true });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes an archived event series that still has registrations", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  it("takes the events of the event series with it, since they are fields of its document", async () => {
    seedEventSeries("s1", {
      isArchived: true,
      events: [{ name: "Montafon" }, { name: "Lech" }],
    });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s1")).toBeUndefined();
  });

  it("deletes every registration of the event series", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", {
      studentUid: "u1",
      emergencyContact: { firstName: "Maria", lastName: "Muster" },
      rentedEquipment: ["Ski"],
    });

    await deleteEventSeries("s1");

    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  /**
   * A token names its series by a field, so nothing about the series' own removal reaches it.
   * Left behind it resolves to a series that is not there, which is a link that looks live.
   */
  it("deletes every invitation of the event series", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed("invitations", "tok1", { eventSeriesId: "s1", class: "5AHIF" });
    firestore.seed("invitations", "tok2", { eventSeriesId: "s1", class: "5BHIF" });

    await deleteEventSeries("s1");

    expect(firestore.count("invitations")).toBe(0);
  });

  /** Firestore deletes no subcollection with its parent, so the reports have to be taken too. */
  it("deletes every saved report of the event series", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(savedReportPath("s1"), "r1", { name: "5AHIF" });

    await deleteEventSeries("s1");

    expect(firestore.count(savedReportPath("s1"))).toBe(0);
  });

  /**
   * A teacher may save a report right up to the moment the series goes, and that save reads a
   * series still standing, so it succeeds. Sweeping once before the parent leaves it behind;
   * sweeping again after, when nothing further can be written, is what makes the delete total.
   */
  it("sweeps again after the series is gone, catching what was written while it ran", async () => {
    seedEventSeries("s1", { isArchived: true });
    const removeDoc = firestore.deleteDoc.bind(firestore);
    const spy = vi.spyOn(firestore, "deleteDoc").mockImplementation((path: string, id: string) => {
      if (path === "eventSeries" && id === "s1") {
        firestore.seed(savedReportPath("s1"), "late", { name: "Spät" });
        firestore.seed("invitations", "late", { eventSeriesId: "s1", class: "5AHIF" });
      }
      removeDoc(path, id);
    });

    try {
      await deleteEventSeries("s1");
    } finally {
      spy.mockRestore();
    }

    expect(firestore.count(savedReportPath("s1"))).toBe(0);
    expect(firestore.count("invitations")).toBe(0);
  });

  it("leaves documents of other event series untouched", async () => {
    seedEventSeries("s1", { isArchived: true, events: [{ name: "Montafon" }] });
    seedEventSeries("s2", { events: [{ name: "Behalten" }] });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });
    firestore.seed(registrationPath("s2"), "keep", { studentUid: "u2" });
    firestore.seed("invitations", "tok1", { eventSeriesId: "s1", class: "5AHIF" });
    firestore.seed("invitations", "keep", { eventSeriesId: "s2", class: "5AHIF" });
    firestore.seed(savedReportPath("s1"), "r1", { name: "5AHIF" });
    firestore.seed(savedReportPath("s2"), "keep", { name: "5AHIF" });

    await deleteEventSeries("s1");

    expect(firestore.get("eventSeries", "s2")).toMatchObject({ events: [{ name: "Behalten" }] });
    expect(Object.keys(firestore.docs(registrationPath("s2")))).toEqual(["keep"]);
    expect(Object.keys(firestore.docs("invitations"))).toEqual(["keep"]);
    expect(Object.keys(firestore.docs(savedReportPath("s2")))).toEqual(["keep"]);
  });

  it("chunks the cascade into batches no larger than the Firestore limit", async () => {
    seedEventSeries("s1", { isArchived: true });
    for (let index = 0; index < 1200; index += 1) {
      firestore.seed(registrationPath("s1"), `m${index}`, { studentUid: `u${index}` });
    }

    await deleteEventSeries("s1");

    expect(firestore.count(registrationPath("s1"))).toBe(0);
    expect(Math.max(...firestore.batchSizes)).toBeLessThanOrEqual(500);
    expect(firestore.commitCount).toBeGreaterThan(2);
  });

  it("is retry-safe: deleting the leftovers of a half-finished cascade still succeeds", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "orphan", { studentUid: "u1" });

    await deleteEventSeries("s1");
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "orphan", { studentUid: "u1" });

    await expect(deleteEventSeries("s1")).resolves.toBeUndefined();
    expect(firestore.count(registrationPath("s1"))).toBe(0);
  });

  it("removes the event series only after its dependants are gone", async () => {
    seedEventSeries("s1", { isArchived: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

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
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

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
 * US-29). The invitation link opens a series too, and closing withdraws every link it handed
 * out, so reopening is a fresh start rather than a resurrection.
 */
describe("updateEventSeries — opening to students", () => {
  it("opens a series to students", async () => {
    seedEventSeries("s1", { classOptions: ["3aWI"] });

    await updateEventSeries("s1", { isOpenToStudents: true });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: true });
  });

  /**
   * Closing is the only remedy a teacher has for a link that got out beyond one class, and it
   * was a loan rather than a remedy: the token survived, and reopening handed it back armed.
   */
  it("withdraws every link it handed out", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed("invitations", "tokenA", { eventSeriesId: "s1", class: "3aWI" });
    firestore.seed("invitations", "tokenB", { eventSeriesId: "s1", class: "3bWI" });

    await updateEventSeries("s1", { isOpenToStudents: false });

    expect(firestore.get("eventSeries", "s1")).toMatchObject({ isOpenToStudents: false });
    expect(firestore.get("invitations", "tokenA")).toBeUndefined();
    expect(firestore.get("invitations", "tokenB")).toBeUndefined();
  });

  it("leaves another series' links alone", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    seedEventSeries("s2", { isOpenToStudents: true });
    firestore.seed("invitations", "tokenOther", { eventSeriesId: "s2", class: "3aWI" });

    await updateEventSeries("s1", { isOpenToStudents: false });

    expect(firestore.get("invitations", "tokenOther")).toBeDefined();
  });

  /** Archiving closes, so it withdraws them too rather than filing a series with live links. */
  it("withdraws them when the same call closes and archives", async () => {
    seedEventSeries("s1", { isOpenToStudents: true });
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });
    firestore.seed("invitations", "tokenA", { eventSeriesId: "s1", class: "3aWI" });

    await updateEventSeries("s1", { isArchived: true, isOpenToStudents: false });

    expect(firestore.get("invitations", "tokenA")).toBeUndefined();
  });

  /** A rename is not a closing, and an already-closed series has nothing left to withdraw. */
  it("withdraws nothing when the series was not open to begin with", async () => {
    seedEventSeries("s1", { isOpenToStudents: false });
    firestore.seed("invitations", "tokenA", { eventSeriesId: "s1", class: "3aWI" });

    await updateEventSeries("s1", { name: "Neuer Name" });

    expect(firestore.get("invitations", "tokenA")).toBeDefined();
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
    firestore.seed(registrationPath("s1"), "m1", { studentUid: "u1" });

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

/**
 * What `/app` opens on, and what the navigation points at from a page that names no series (Q8).
 * Archiving is what takes a series off every screen, so it is the only thing that can make a
 * remembered id unusable.
 */
describe("resolveSelectedEventSeriesId", () => {
  it("takes the remembered series when it is still selectable", async () => {
    seedEventSeries("s1", { position: 0 });
    seedEventSeries("s2", { position: 1 });

    expect(await resolveSelectedEventSeriesId("s2")).toBe("s2");
  });

  it("falls back to the first in the teacher's order", async () => {
    seedEventSeries("s2", { position: 1 });
    seedEventSeries("s1", { position: 0 });

    expect(await resolveSelectedEventSeriesId()).toBe("s1");
  });

  it("passes over a remembered archived series, which has no pages left to open", async () => {
    seedEventSeries("remembered", { position: 0, isArchived: true });
    seedEventSeries("s1", { position: 1 });

    expect(await resolveSelectedEventSeriesId("remembered")).toBe("s1");
  });

  it("selects nothing when every series is archived", async () => {
    seedEventSeries("old", { position: 0, isArchived: true });

    expect(await resolveSelectedEventSeriesId()).toBeNull();
  });
});
