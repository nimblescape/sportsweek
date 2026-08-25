import { describe, expect, it } from "vitest";
import {
  busPickupPointSchema,
  classOptionSchema,
  FOOD_OPTION_OTHER,
  foodOptionSchema,
  programSchema,
  requiredEquipmentItemSchema,
  seasonPassOptionSchema,
  skillLevelSchema,
} from "@/lib/schemas/master-data";

const NAMED_LIST_SCHEMAS = [
  ["classOption", classOptionSchema],
  ["skillLevel", skillLevelSchema],
  ["busPickupPoint", busPickupPointSchema],
  ["foodOption", foodOptionSchema],
  ["seasonPassOption", seasonPassOptionSchema],
  ["program", programSchema],
] as const;

describe.each(NAMED_LIST_SCHEMAS)("%s schema", (_name, schema) => {
  it("parses an item with an id and a name", () => {
    expect(schema.parse({ id: "item-1", name: "Ski" })).toEqual({ id: "item-1", name: "Ski" });
  });

  it("requires a non-empty name", () => {
    expect(schema.safeParse({ id: "item-1", name: "   " }).success).toBe(false);
  });

  it("requires an id", () => {
    expect(schema.safeParse({ id: "", name: "Ski" }).success).toBe(false);
  });
});

describe("requiredEquipmentItemSchema", () => {
  const validItem = { id: "equip-1", programId: "program-1", name: "Skischuhe" };

  it("parses a valid required equipment item", () => {
    expect(requiredEquipmentItemSchema.parse(validItem)).toEqual(validItem);
  });

  it("belongs to a program via a genuine foreign key", () => {
    expect(requiredEquipmentItemSchema.safeParse({ ...validItem, programId: "" }).success).toBe(
      false,
    );
  });
});

describe("FOOD_OPTION_OTHER", () => {
  it("is a stable sentinel rather than teacher-editable display text", () => {
    expect(FOOD_OPTION_OTHER).toBe("other");
  });
});
