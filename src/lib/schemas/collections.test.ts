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
        "requiredEquipmentItems",
        "classOptions",
        "skillLevels",
        "busPickupPoints",
        "foodOptions",
        "seasonPassOptions",
        "studentMasterData",
        "emergencyContacts",
        "equipmentRentalItems",
        "savedReportFilters",
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
