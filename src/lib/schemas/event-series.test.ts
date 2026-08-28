/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { eventSchema, eventSeriesSchema } from "@/lib/schemas/event-series";

const validEventSeries = {
  id: "event series-1",
  name: "Wintersportwoche 2026",
  nameKey: "wintersportwoche 2026",
  isActive: true,
  isArchived: false,
  hasRegistrations: false,
  position: 0,
  classOptions: ["3AHIT"],
  programs: [{ name: "Ski", requiredEquipment: ["Helm"] }],
  skillLevels: ["Keine Vorkenntnisse"],
  seasonPassOptions: ["Saisonkarte"],
  busPickupPoints: ["Dornbirn"],
  foodOptions: ["Vegetarisch"],
};
const validEvent = {
  id: "event-1",
  eventSeriesId: "event series-1",
  name: "Montafon",
  nameKey: "montafon",
  position: 0,
};

describe("eventSeriesSchema", () => {
  it("parses a valid event series", () => {
    expect(eventSeriesSchema.parse(validEventSeries)).toEqual(validEventSeries);
  });

  it("requires a name", () => {
    expect(eventSeriesSchema.safeParse({ ...validEventSeries, name: "" }).success).toBe(false);
  });

  it.each(["isActive", "isArchived", "hasRegistrations"])(
    "requires %s to be a boolean",
    (field) => {
      expect(eventSeriesSchema.safeParse({ ...validEventSeries, [field]: "yes" }).success).toBe(
        false,
      );
    },
  );

  it("carries no third state field, since the displayed state is derived", () => {
    expect(Object.keys(eventSeriesSchema.shape).sort()).toEqual(
      [
        "id",
        "isActive",
        "isArchived",
        "hasRegistrations",
        "name",
        "nameKey",
        "position",
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

  it.each([
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
});

describe("eventSchema", () => {
  it("parses a valid event", () => {
    expect(eventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("requires the owning event series as a genuine foreign key", () => {
    expect(eventSchema.safeParse({ ...validEvent, eventSeriesId: "" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(eventSchema.safeParse({ ...validEvent, name: "" }).success).toBe(false);
  });

  it("requires the derived name key, which the uniqueness query compares on", () => {
    expect(eventSchema.safeParse({ ...validEvent, nameKey: "" }).success).toBe(false);
  });
});
