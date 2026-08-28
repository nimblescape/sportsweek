/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_REGISTRATION,
  recordIdFor,
  REGISTRATION_NOT_OPEN_HINT,
  scopeRentalToProgram,
} from "./registration";

describe("recordIdFor", () => {
  it("derives the id from the event series and the student", () => {
    expect(recordIdFor("eventSeries1", "jane.doe@student.htldornbirn.at")).toBe(
      "eventSeries1__jane.doe@student.htldornbirn.at",
    );
  });

  /**
   * The point of deriving it: one student can hold exactly one record per event series without
   * anyone having to query for it, because document ids are unique by construction.
   */
  it("gives the same student the same id for the same event series", () => {
    expect(recordIdFor("eventSeries1", "jane@student.htldornbirn.at")).toBe(
      recordIdFor("eventSeries1", "jane@student.htldornbirn.at"),
    );
  });

  it("gives the same student a separate id per event series", () => {
    expect(recordIdFor("eventSeries1", "jane@student.htldornbirn.at")).not.toBe(
      recordIdFor("eventSeries2", "jane@student.htldornbirn.at"),
    );
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
