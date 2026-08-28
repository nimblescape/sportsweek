/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_REGISTRATION,
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

  it("states the message US-11 asks for while registering is not open", () => {
    expect(REGISTRATION_NOT_OPEN_HINT).toBe("Es ist noch keine Sportveranstaltung freigeschalten.");
  });
});

describe("scopeRentalToProgram", () => {
  const renting = {
    ...EMPTY_REGISTRATION,
    class: "3AHME",
    program: "Ski",
    equipmentRentalNeeded: true,
    rentedEquipment: ["Helm", "Ski"],
  };

  it("keeps a selection the program still requires", () => {
    const scoped = scopeRentalToProgram(renting, ["Ski", "Helm", "Stöcke"]);

    expect(scoped.rentedEquipment).toEqual(["Helm", "Ski"]);
  });

  /** Switching program leaves the old boxes ticked in form state; they must not be stored. */
  it("drops an item the selected program does not require", () => {
    const scoped = scopeRentalToProgram(renting, ["Board", "Helm"]);

    expect(scoped.rentedEquipment).toEqual(["Helm"]);
  });

  /**
   * A rented name is what holds a teacher back from removing that equipment (US-5), so a student
   * who is not borrowing anything must not keep blocking it.
   */
  it("clears the selection once the student says they need nothing", () => {
    const scoped = scopeRentalToProgram({ ...renting, equipmentRentalNeeded: false }, ["Ski"]);

    expect(scoped.rentedEquipment).toEqual([]);
  });

  it("takes the question away entirely for a program that requires nothing", () => {
    const scoped = scopeRentalToProgram(renting, []);

    expect(scoped).toMatchObject({ equipmentRentalNeeded: null, rentedEquipment: [] });
  });

  it("leaves every other answer untouched", () => {
    const scoped = scopeRentalToProgram(renting, ["Ski", "Helm"]);

    expect(scoped).toMatchObject({ class: "3AHME", program: "Ski" });
  });
});
