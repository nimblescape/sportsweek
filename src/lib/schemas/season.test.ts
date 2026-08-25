/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { eventSchema, seasonSchema } from "@/lib/schemas/season";

const validSeason = {
  id: "season-1",
  name: "Wintersportwoche 2026",
  isActive: true,
  isArchived: false,
  hasStudentData: false,
};
const validEvent = { id: "event-1", seasonId: "season-1", name: "Montafon" };

describe("seasonSchema", () => {
  it("parses a valid season", () => {
    expect(seasonSchema.parse(validSeason)).toEqual(validSeason);
  });

  it("requires a name", () => {
    expect(seasonSchema.safeParse({ ...validSeason, name: "" }).success).toBe(false);
  });

  it.each(["isActive", "isArchived", "hasStudentData"])("requires %s to be a boolean", (field) => {
    expect(seasonSchema.safeParse({ ...validSeason, [field]: "yes" }).success).toBe(false);
  });

  it("carries no third state field, since the displayed state is derived", () => {
    expect(Object.keys(seasonSchema.shape).sort()).toEqual(
      ["id", "isActive", "isArchived", "hasStudentData", "name"].sort(),
    );
  });
});

describe("eventSchema", () => {
  it("parses a valid event", () => {
    expect(eventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("requires the owning season as a genuine foreign key", () => {
    expect(eventSchema.safeParse({ ...validEvent, seasonId: "" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(eventSchema.safeParse({ ...validEvent, name: "" }).success).toBe(false);
  });
});
