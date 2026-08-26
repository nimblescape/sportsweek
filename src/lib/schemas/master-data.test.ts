/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  busPickupPointSchema,
  classOptionSchema,
  FOOD_OPTION_OTHER,
  FOOD_OPTION_OTHER_LABEL,
  foodOptionSchema,
  MAX_EQUIPMENT_ITEMS,
  programSchema,
  requiredEquipmentSchema,
  seasonPassOptionSchema,
  skillLevelSchema,
} from "@/lib/schemas/master-data";

const NAMED_LIST_SCHEMAS = [
  ["classOption", classOptionSchema],
  ["skillLevel", skillLevelSchema],
  ["busPickupPoint", busPickupPointSchema],
  ["foodOption", foodOptionSchema],
  ["seasonPassOption", seasonPassOptionSchema],
] as const;

describe.each(NAMED_LIST_SCHEMAS)("%s schema", (_name, schema) => {
  it("parses an item with an id, a name and its place in the order", () => {
    expect(schema.parse({ id: "item-1", name: "Ski", position: 2 })).toEqual({
      id: "item-1",
      name: "Ski",
      position: 2,
    });
  });

  it("sorts an item stored before ordering existed to the end, not the top", () => {
    expect(schema.parse({ id: "item-1", name: "Ski" }).position).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("requires a non-empty name", () => {
    expect(schema.safeParse({ id: "item-1", name: "   " }).success).toBe(false);
  });

  it("requires an id", () => {
    expect(schema.safeParse({ id: "", name: "Ski" }).success).toBe(false);
  });
});

describe("requiredEquipmentSchema", () => {
  it("accepts a list of names", () => {
    expect(requiredEquipmentSchema.parse(["Ski", "Helm"])).toEqual(["Ski", "Helm"]);
  });

  it("accepts an empty list, which is what Alternativ needs", () => {
    expect(requiredEquipmentSchema.parse([])).toEqual([]);
  });

  it("trims each name", () => {
    expect(requiredEquipmentSchema.parse(["  Helm  "])).toEqual(["Helm"]);
  });

  it("rejects a blank entry", () => {
    expect(requiredEquipmentSchema.safeParse(["Helm", "   "]).success).toBe(false);
  });

  it("rejects a duplicate within the same program, ignoring case and surrounding space", () => {
    expect(requiredEquipmentSchema.safeParse(["Helm", " helm "]).success).toBe(false);
  });

  it("accepts as many entries as there is equipment to hand out", () => {
    const full = Array.from({ length: MAX_EQUIPMENT_ITEMS }, (_, index) => `Teil ${index}`);

    expect(requiredEquipmentSchema.safeParse(full).success).toBe(true);
  });

  it("rejects a list longer than that, which no equipment room could serve", () => {
    const tooMany = Array.from({ length: MAX_EQUIPMENT_ITEMS + 1 }, (_, index) => `Teil ${index}`);

    expect(requiredEquipmentSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("programSchema", () => {
  it("carries its required equipment rather than pointing at records of its own", () => {
    expect(
      programSchema.parse({ id: "p1", name: "Ski", position: 0, requiredEquipment: ["Helm"] }),
    ).toEqual({
      id: "p1",
      name: "Ski",
      position: 0,
      requiredEquipment: ["Helm"],
    });
  });

  it("treats a program stored before the field existed as requiring nothing", () => {
    expect(programSchema.parse({ id: "p1", name: "Alternativ", position: 0 })).toEqual({
      id: "p1",
      name: "Alternativ",
      position: 0,
      requiredEquipment: [],
    });
  });

  it("requires a non-empty name", () => {
    expect(programSchema.safeParse({ id: "p1", name: "  " }).success).toBe(false);
  });
});

describe("FOOD_OPTION_OTHER", () => {
  it("is a stable sentinel rather than teacher-editable display text", () => {
    expect(FOOD_OPTION_OTHER).toBe("other");
  });

  it("is shown to the user under a German label, which is not the stored value", () => {
    expect(FOOD_OPTION_OTHER_LABEL).toBe("Sonstiges");
    expect(FOOD_OPTION_OTHER_LABEL).not.toBe(FOOD_OPTION_OTHER);
  });
});
