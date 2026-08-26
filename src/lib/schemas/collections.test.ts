/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "@/lib/schemas/collections";

describe("COLLECTIONS", () => {
  it("centralises every collection the data model needs", () => {
    expect(Object.keys(COLLECTIONS).sort()).toEqual(
      [
        "users",
        "seasons",
        "events",
        "programs",
        "classOptions",
        "skillLevels",
        "busPickupPoints",
        "foodOptions",
        "seasonPassOptions",
        // Emergency contact and rented equipment are fields of this record, not collections of
        // their own: neither has an identity outside it, and nothing else refers to them (US-11).
        "studentMasterData",
        "savedReportFilters",
        // Not an entity of its own: one document per claimed name, which is how uniqueness
        // is enforced (US-4 to US-10). See lib/firebase/unique-name.ts.
        "reservedNames",
        // Likewise bookkeeping: which defaults have already been seeded, so one a teacher
        // deleted is never brought back (US-5, US-7 to US-10).
        "seedState",
      ].sort(),
    );
  });

  it("maps every key to a unique path segment", () => {
    const values = Object.values(COLLECTIONS);

    expect(new Set(values).size).toBe(values.length);
  });

  it("uses single path segments, so call sites cannot build paths by hand", () => {
    for (const value of Object.values(COLLECTIONS)) {
      expect(value).not.toContain("/");
    }
  });
});
