/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { eventSeriesSchema } from "@/lib/schemas/event-series";

const validEventSeries = {
  id: "event series-1",
  name: "Wintersportwoche 2026",
  nameKey: "wintersportwoche 2026",
  isArchived: false,
  isOpenToStudents: false,
  hasRegistrations: false,
  position: 0,
  events: [{ name: "Woche 1" }],
  classOptions: ["3AHIT"],
  programs: [{ name: "Ski", requiredEquipment: ["Helm"] }],
  skillLevels: ["Keine Vorkenntnisse"],
  seasonPassOptions: ["Saisonkarte"],
  busPickupPoints: ["Dornbirn"],
  foodOptions: ["Vegetarisch"],
};

describe("eventSeriesSchema", () => {
  it("parses a valid event series", () => {
    expect(eventSeriesSchema.parse(validEventSeries)).toEqual(validEventSeries);
  });

  it("requires a name", () => {
    expect(eventSeriesSchema.safeParse({ ...validEventSeries, name: "" }).success).toBe(false);
  });

  it.each(["isArchived", "isOpenToStudents", "hasRegistrations"])(
    "requires %s to be a boolean",
    (field) => {
      expect(eventSeriesSchema.safeParse({ ...validEventSeries, [field]: "yes" }).success).toBe(
        false,
      );
    },
  );

  // A series stored before the flag existed is not open, which is what a teacher would expect of
  // one they have not touched since (US-19).
  it("defaults isOpenToStudents to false", () => {
    const without = Object.fromEntries(
      Object.entries(validEventSeries).filter(([key]) => key !== "isOpenToStudents"),
    );

    expect(eventSeriesSchema.parse(without)).toMatchObject({ isOpenToStudents: false });
  });

  it("carries no state field of its own, since what the list shows is derived", () => {
    expect(Object.keys(eventSeriesSchema.shape).sort()).toEqual(
      [
        "id",
        "isArchived",
        "isOpenToStudents",
        "hasRegistrations",
        "name",
        "nameKey",
        "position",
        "events",
        "classOptions",
        "programs",
        "skillLevels",
        "seasonPassOptions",
        "busPickupPoints",
        "foodOptions",
      ].sort(),
    );
  });

  it("requires the derived name key, which the uniqueness query compares on", () => {
    expect(eventSeriesSchema.safeParse({ ...validEventSeries, nameKey: "" }).success).toBe(false);
  });

  // The events are one of these lists rather than a collection of their own, so a registration
  // names the event it is assigned to exactly as it names its class (US-12, US-21).
  it.each([
    "events",
    "classOptions",
    "programs",
    "skillLevels",
    "seasonPassOptions",
    "busPickupPoints",
    "foodOptions",
  ] as const)("reads %s as empty on a series stored before the field existed", (field) => {
    const withoutList: Record<string, unknown> = { ...validEventSeries };
    delete withoutList[field];

    expect(eventSeriesSchema.parse(withoutList)[field]).toEqual([]);
  });

  it("refuses two events of the same name, since a name is what a registration holds", () => {
    expect(
      eventSeriesSchema.safeParse({
        ...validEventSeries,
        events: [{ name: "Woche 1" }, { name: "woche 1" }],
      }).success,
    ).toBe(false);
  });
});
