/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";
import type { Registration } from "@/lib/schemas/registration";
import type { User } from "@/lib/schemas/user";
import { joinRoster } from "./roster";

function user(id: string, firstName: string, lastName: string): User {
  return { id, firstName, lastName, email: id, role: "student" };
}

function record(userId: string, overrides: Partial<Registration> = {}): Registration {
  return {
    id: `s1__${userId}`,
    userId,
    eventSeriesId: "s1",
    event: null,
    isIncomplete: false,
    isAttendingSportsWeek: true,
    class: "5AHIF",
    program: "Ski",
    skillLevel: "Fortgeschritten",
    busPickupPoint: null,
    foodOption: null,
    foodOtherText: null,
    seasonPassOption: null,
    dateOfBirth: null,
    gender: "female",
    phoneNumber: null,
    emergencyContact: {
      firstName: null,
      lastName: null,
      relationship: null,
      relationshipOtherText: null,
      phoneNumber: null,
    },
    healthNotes: null,
    hasMedication: null,
    equipmentRentalNeeded: null,
    rentedEquipment: [],
    shoeSize: null,
    heightCm: null,
    weightKg: null,
    ...overrides,
  };
}

const ANNA = user("anna@student.htldornbirn.at", "Anna", "Muster");
const BENE = user("bene@student.htldornbirn.at", "Bene", "Berger");

describe("joinRoster", () => {
  it("takes the name from the user record, which is where it is kept (US-1, US-11)", () => {
    const [student] = joinRoster([record(ANNA.id)], [ANNA]);

    expect(student).toMatchObject({
      id: `s1__${ANNA.id}`,
      userId: ANNA.id,
      firstName: "Anna",
      lastName: "Muster",
      class: "5AHIF",
      gender: "female",
      program: "Ski",
      skillLevel: "Fortgeschritten",
      isAttending: true,
      event: null,
    });
  });

  it("carries the answer to the attendance question, whichever it is", () => {
    const roster = joinRoster([record(ANNA.id, { isAttendingSportsWeek: false })], [ANNA]);

    expect(roster[0].isAttending).toBe(false);
  });

  it("carries the event a teacher has assigned", () => {
    const roster = joinRoster([record(ANNA.id, { event: "Woche 1" })], [ANNA]);

    expect(roster[0].event).toBe("Woche 1");
  });

  it("carries whether equipment is rented, which the report filters by (US-11, US-13)", () => {
    const renting = joinRoster([record(ANNA.id, { equipmentRentalNeeded: true })], [ANNA]);
    const unasked = joinRoster([record(ANNA.id, { equipmentRentalNeeded: null })], [ANNA]);

    expect(renting[0].equipmentRentalNeeded).toBe(true);
    expect(unasked[0].equipmentRentalNeeded).toBeNull();
  });

  it("carries both health answers, which the report filters on together (US-11, US-13)", () => {
    const stored = { healthNotes: "Asthma", hasMedication: true };

    expect(joinRoster([record(ANNA.id, stored)], [ANNA])[0]).toMatchObject(stored);
  });

  it("carries the e-mail address, which the report's master line shows (US-13)", () => {
    const roster = joinRoster([record(ANNA.id)], [ANNA]);

    expect(roster[0].email).toBe(ANNA.email);
  });

  it("keeps the whole registration, which is what the report's detail lines read (US-13)", () => {
    const stored = record(ANNA.id, { healthNotes: "Asthma", isIncomplete: true });

    expect(joinRoster([stored], [ANNA])[0].record).toEqual(stored);
  });

  it("sorts by last name, then first name, so a list can be read down", () => {
    const clara = user("clara@student.htldornbirn.at", "Clara", "Berger");
    const roster = joinRoster(
      [record(ANNA.id), record(BENE.id), record(clara.id)],
      [ANNA, BENE, clara],
    );

    expect(roster.map((student) => student.firstName)).toEqual(["Bene", "Clara", "Anna"]);
  });

  it("sorts the way German does, so an umlaut does not fall off the end", () => {
    const oesterle = user("o@student.htldornbirn.at", "Ida", "Österle");
    const zerbst = user("z@student.htldornbirn.at", "Jan", "Zerbst");

    const roster = joinRoster([record(zerbst.id), record(oesterle.id)], [zerbst, oesterle]);

    expect(roster.map((student) => student.lastName)).toEqual(["Österle", "Zerbst"]);
  });

  it("drops a record whose user is gone rather than showing a nameless row", () => {
    const complain = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      joinRoster([record("ghost@student.htldornbirn.at"), record(ANNA.id)], [ANNA]),
    ).toHaveLength(1);
    expect(complain).toHaveBeenCalled();

    complain.mockRestore();
  });
});
