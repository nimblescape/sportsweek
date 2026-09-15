/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { Registration } from "@/lib/schemas/registration";
import { event, storedEventSeries } from "@/test/event-series";
import { studentRecord } from "@/test/roster-student";
import { toRoster } from "./roster";

const SERIES = storedEventSeries();

function record(
  firstName: string,
  lastName: string,
  overrides: Partial<Registration> = {},
): Registration {
  const uid = asUid(`uid-${firstName}-${lastName}`);

  return studentRecord({
    id: uid,
    studentUid: uid,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@student.htldornbirn.at`.toLowerCase(),
    ...overrides,
  });
}

const ANNA = record("Anna", "Muster");

describe("toRoster", () => {
  it("takes the name from the registration, which is what carries it now (US-26)", () => {
    const [student] = toRoster([ANNA], SERIES);

    expect(student).toMatchObject({
      id: ANNA.id,
      studentUid: ANNA.studentUid,
      firstName: "Anna",
      lastName: "Muster",
      class: "5AHIF",
      gender: "female",
      program: "Ski",
      skillLevel: "Profi",
      isAttending: true,
      event: null,
    });
  });

  it("carries the answer to the attendance question, whichever it is", () => {
    const roster = toRoster([record("Anna", "Muster", { isAttendingSportsWeek: false })], SERIES);

    expect(roster[0].isAttending).toBe(false);
  });

  it("carries the event a teacher has assigned", () => {
    const roster = toRoster([record("Anna", "Muster", { event: "Woche 1" })], SERIES);

    expect(roster[0].event).toBe("Woche 1");
  });

  it("carries whether equipment is rented, which the report filters by (US-11, US-13)", () => {
    const renting = toRoster([record("Anna", "Muster", { equipmentRentalNeeded: true })], SERIES);
    const unasked = toRoster([record("Anna", "Muster", { equipmentRentalNeeded: null })], SERIES);

    expect(renting[0].equipmentRentalNeeded).toBe(true);
    expect(unasked[0].equipmentRentalNeeded).toBeNull();
  });

  it("carries both health answers, which the report filters on together (US-11, US-13)", () => {
    const stored = { healthNotes: "Asthma", hasMedication: true };

    expect(toRoster([record("Anna", "Muster", stored)], SERIES)[0]).toMatchObject(stored);
  });

  it("carries the e-mail address, for a filter or a view that has no use for the whole record", () => {
    expect(toRoster([ANNA], SERIES)[0].email).toBe(ANNA.email);
  });

  it("keeps the whole registration, which is what the report's detail lines read (US-13)", () => {
    const stored = record("Anna", "Muster", { healthNotes: "Asthma" });

    expect(toRoster([stored], SERIES)[0].record).toEqual(stored);
  });

  it("sorts by last name, then first name, so a list can be read down", () => {
    const roster = toRoster([ANNA, record("Bene", "Berger"), record("Clara", "Berger")], SERIES);

    expect(roster.map((student) => student.firstName)).toEqual(["Bene", "Clara", "Anna"]);
  });

  it("sorts the way German does, so an umlaut does not fall off the end", () => {
    const roster = toRoster([record("Jan", "Zerbst"), record("Ida", "Österle")], SERIES);

    expect(roster.map((student) => student.lastName)).toEqual(["Österle", "Zerbst"]);
  });

  /** The join could drop a row for want of a user record; a projection has nothing to miss. */
  it("keeps every registration it is given", () => {
    expect(toRoster([ANNA, record("Bene", "Berger")], SERIES)).toHaveLength(2);
  });

  /**
   * Recomputed from what the series currently asks rather than trusted from the record, so a
   * teacher adding a per-event list afterwards cannot leave an older answer looking complete for
   * a question nobody has actually put yet (US-13, US-36).
   */
  it("marks a registration incomplete for what the series asks now, not for what it stored", () => {
    const unfinished = record("Anna", "Muster", { phoneNumber: null });

    expect(toRoster([unfinished], SERIES)[0].isIncomplete).toBe(true);
  });

  it("asks nothing a two-step series leaves for step two while nobody has an event yet", () => {
    const twoStep = storedEventSeries({
      events: [event("Woche 1", { programs: [{ name: "Ski", requiredEquipment: [] }] })],
    });
    const unassigned = record("Anna", "Muster", { event: null, program: null, skillLevel: null });

    expect(toRoster([unassigned], twoStep)[0].isIncomplete).toBe(false);
  });
});
