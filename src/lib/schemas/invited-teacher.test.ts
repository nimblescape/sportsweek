/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { classAssignmentSchema, invitedTeacherSchema } from "@/lib/schemas/invited-teacher";

describe("classAssignmentSchema", () => {
  it("accepts an event series id and a class name", () => {
    const parsed = classAssignmentSchema.safeParse({ eventSeriesId: "abc123", class: "2aWI" });

    expect(parsed.success).toBe(true);
  });

  it("refuses an empty class name", () => {
    const parsed = classAssignmentSchema.safeParse({ eventSeriesId: "abc123", class: "" });

    expect(parsed.success).toBe(false);
  });

  it("refuses an id carrying a path", () => {
    const parsed = classAssignmentSchema.safeParse({ eventSeriesId: "a/b", class: "2aWI" });

    expect(parsed.success).toBe(false);
  });
});

describe("invitedTeacherSchema", () => {
  it("defaults classAssignments to an empty list for an invitation predating it", () => {
    const parsed = invitedTeacherSchema.safeParse({
      firstName: "Ada",
      lastName: "Auer",
      permissions: [],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.classAssignments).toEqual([]);
  });

  it("carries the assignments it is given", () => {
    const parsed = invitedTeacherSchema.safeParse({
      firstName: "Ada",
      lastName: "Auer",
      permissions: [],
      classAssignments: [{ eventSeriesId: "s1", class: "2aWI" }],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.classAssignments).toEqual([
      { eventSeriesId: "s1", class: "2aWI" },
    ]);
  });
});
