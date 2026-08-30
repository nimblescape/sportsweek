/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { Registration } from "@/lib/schemas/registration";
import { studentRecord } from "@/test/roster-student";
import { toRoster } from "./roster";

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
    const [student] = toRoster([ANNA]);

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
    const roster = toRoster([record("Anna", "Muster", { isAttendingSportsWeek: false })]);

    expect(roster[0].isAttending).toBe(false);
  });

  it("carries the event a teacher has assigned", () => {
    const roster = toRoster([record("Anna", "Muster", { event: "Woche 1" })]);

    expect(roster[0].event).toBe("Woche 1");
  });

  it("carries whether equipment is rented, which the report filters by (US-11, US-13)", () => {
    const renting = toRoster([record("Anna", "Muster", { equipmentRentalNeeded: true })]);
    const unasked = toRoster([record("Anna", "Muster", { equipmentRentalNeeded: null })]);

    expect(renting[0].equipmentRentalNeeded).toBe(true);
    expect(unasked[0].equipmentRentalNeeded).toBeNull();
  });

  it("carries both health answers, which the report filters on together (US-11, US-13)", () => {
    const stored = { healthNotes: "Asthma", hasMedication: true };

    expect(toRoster([record("Anna", "Muster", stored)])[0]).toMatchObject(stored);
  });

  it("carries the e-mail address, which the report's master line shows (US-13)", () => {
    expect(toRoster([ANNA])[0].email).toBe(ANNA.email);
  });

  it("keeps the whole registration, which is what the report's detail lines read (US-13)", () => {
    const stored = record("Anna", "Muster", { healthNotes: "Asthma", isIncomplete: true });

    expect(toRoster([stored])[0].record).toEqual(stored);
  });

  it("sorts by last name, then first name, so a list can be read down", () => {
    const roster = toRoster([ANNA, record("Bene", "Berger"), record("Clara", "Berger")]);

    expect(roster.map((student) => student.firstName)).toEqual(["Bene", "Clara", "Anna"]);
  });

  it("sorts the way German does, so an umlaut does not fall off the end", () => {
    const roster = toRoster([record("Jan", "Zerbst"), record("Ida", "Österle")]);

    expect(roster.map((student) => student.lastName)).toEqual(["Österle", "Zerbst"]);
  });

  /** The join could drop a row for want of a user record; a projection has nothing to miss. */
  it("keeps every registration it is given", () => {
    expect(toRoster([ANNA, record("Bene", "Berger")])).toHaveLength(2);
  });
});
