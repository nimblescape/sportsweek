/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_REGISTRATION,
  INVALID_LINK_HINT,
  registrationPath,
  REGISTRATION_NOT_OPEN_HINT,
  scopeRentalToProgram,
} from "./registration";

describe("registrationPath", () => {
  it("puts a registration beneath the event series it belongs to (US-26)", () => {
    expect(registrationPath("eventSeries1")).toBe("eventSeries/eventSeries1/registrations");
  });

  /**
   * The point of deriving it: which series a registration is in is where it is stored rather
   * than a field, so one student holds exactly one per series without anyone querying for it.
   */
  it("gives each event series its own collection", () => {
    expect(registrationPath("eventSeries1")).not.toBe(registrationPath("eventSeries2"));
  });

  /** "Veranstaltung" because a series may be a Kulturwoche; "derzeit" because it can reclose. */
  it("states the message for a student signed in holding no registration at all", () => {
    expect(REGISTRATION_NOT_OPEN_HINT).toBe("Derzeit ist keine Veranstaltung freigeschaltet.");
  });

  it("states a different message for a link that never led anywhere", () => {
    expect(INVALID_LINK_HINT).toBe("Dieser Link ist ungültig.");
  });
});

describe("scopeRentalToProgram", () => {
  const renting = {
    ...EMPTY_REGISTRATION,
    program: "Ski",
    equipmentRentalNeeded: true,
    rentedEquipment: ["Helm", "Ski"],
  };

  const lent = (...names: string[]) => names.map((name) => ({ name, isRentable: true }));

  it("keeps a selection the program still lends", () => {
    const scoped = scopeRentalToProgram(renting, lent("Ski", "Helm", "Stöcke"));

    expect(scoped.rentedEquipment).toEqual(["Helm", "Ski"]);
  });

  /** Switching program leaves the old boxes ticked in form state; they must not be stored. */
  it("drops an item the selected program does not require", () => {
    const scoped = scopeRentalToProgram(renting, lent("Board", "Helm"));

    expect(scoped.rentedEquipment).toEqual(["Helm"]);
  });

  /** The list is what a student needs; only part of it is what the school hands out (US-36). */
  it("drops an item the program requires but does not lend", () => {
    const scoped = scopeRentalToProgram(renting, [
      { name: "Ski", isRentable: true },
      { name: "Helm", isRentable: false },
    ]);

    expect(scoped.rentedEquipment).toEqual(["Ski"]);
  });

  /**
   * A rented name is what holds a teacher back from removing that equipment (US-5), so a student
   * who is not borrowing anything must not keep blocking it.
   */
  it("clears the selection once the student says they need nothing", () => {
    const scoped = scopeRentalToProgram({ ...renting, equipmentRentalNeeded: false }, lent("Ski"));

    expect(scoped.rentedEquipment).toEqual([]);
  });

  it("takes the question away entirely for a program that requires nothing", () => {
    const scoped = scopeRentalToProgram(renting, []);

    expect(scoped).toMatchObject({ equipmentRentalNeeded: null, rentedEquipment: [] });
  });

  /** A packing list is not a question: nothing to borrow means nothing to answer (US-36). */
  it("takes it away too for a program that requires things it does not lend", () => {
    const scoped = scopeRentalToProgram(renting, [{ name: "Hose", isRentable: false }]);

    expect(scoped).toMatchObject({ equipmentRentalNeeded: null, rentedEquipment: [] });
  });

  it("leaves every other answer untouched", () => {
    const scoped = scopeRentalToProgram(renting, lent("Ski", "Helm"));

    expect(scoped).toMatchObject({ program: "Ski" });
  });
});
