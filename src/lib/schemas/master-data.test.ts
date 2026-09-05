/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  eventListSchema,
  eventSchema,
  FOOD_OPTION_OTHER,
  FOOD_OPTION_OTHER_LABEL,
  listItemNameSchema,
  MAX_EQUIPMENT_ITEMS,
  MAX_LIST_ITEMS,
  namedListSchema,
  programListSchema,
  programSchema,
  requiredEquipmentSchema,
} from "@/lib/schemas/master-data";

function namesOfLength(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Eintrag ${index}`);
}

describe("listItemNameSchema", () => {
  it("trims the name, since surrounding space is not part of an identity", () => {
    expect(listItemNameSchema.parse("  Ski  ")).toBe("Ski");
  });

  it("rejects a blank name", () => {
    expect(listItemNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a name longer than a label could show", () => {
    expect(listItemNameSchema.safeParse("x".repeat(121)).success).toBe(false);
  });
});

describe("namedListSchema", () => {
  it("stores bare names in the teacher's order, which no field restates", () => {
    expect(namedListSchema.parse(["Zoe", "Anton", "Mia"])).toEqual(["Zoe", "Anton", "Mia"]);
  });

  it("accepts an empty list, which is a question the student is never asked", () => {
    expect(namedListSchema.parse([])).toEqual([]);
  });

  it("trims each name", () => {
    expect(namedListSchema.parse(["  3AHIT  "])).toEqual(["3AHIT"]);
  });

  it("rejects a blank entry", () => {
    expect(namedListSchema.safeParse(["3AHIT", "  "]).success).toBe(false);
  });

  it("rejects a duplicate, ignoring case and surrounding space", () => {
    expect(namedListSchema.safeParse(["3AHIT", " 3ahit "]).success).toBe(false);
  });

  it("accepts a list as long as a school could plausibly need", () => {
    expect(namedListSchema.safeParse(namesOfLength(MAX_LIST_ITEMS)).success).toBe(true);
  });

  it("rejects a list longer than that, so one field cannot fill the whole document", () => {
    expect(namedListSchema.safeParse(namesOfLength(MAX_LIST_ITEMS + 1)).success).toBe(false);
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
    expect(requiredEquipmentSchema.safeParse(namesOfLength(MAX_EQUIPMENT_ITEMS)).success).toBe(
      true,
    );
  });

  it("rejects a list longer than that, which no equipment room could serve", () => {
    expect(requiredEquipmentSchema.safeParse(namesOfLength(MAX_EQUIPMENT_ITEMS + 1)).success).toBe(
      false,
    );
  });
});

describe("programSchema", () => {
  it("carries its required equipment rather than pointing at records of its own", () => {
    expect(programSchema.parse({ name: "Ski", requiredEquipment: ["Helm"] })).toEqual({
      name: "Ski",
      requiredEquipment: ["Helm"],
    });
  });

  it("treats a program stored before the field existed as requiring nothing", () => {
    expect(programSchema.parse({ name: "Alternativ" })).toEqual({
      name: "Alternativ",
      requiredEquipment: [],
    });
  });

  it("carries neither an id nor a position: the name identifies it, the array orders it", () => {
    expect(Object.keys(programSchema.shape).sort()).toEqual(["name", "requiredEquipment"]);
  });

  it("requires a non-empty name", () => {
    expect(programSchema.safeParse({ name: "  " }).success).toBe(false);
  });
});

describe("programListSchema", () => {
  it("keeps the teacher's order rather than sorting by name", () => {
    const programs = [{ name: "Snowboard" }, { name: "Ski" }];

    expect(programListSchema.parse(programs).map((program) => program.name)).toEqual([
      "Snowboard",
      "Ski",
    ]);
  });

  it("rejects two programs of the same name, ignoring case and surrounding space", () => {
    expect(programListSchema.safeParse([{ name: "Ski" }, { name: " ski " }]).success).toBe(false);
  });

  it("allows two programs to require the same equipment", () => {
    const programs = [
      { name: "Ski", requiredEquipment: ["Helm"] },
      { name: "Snowboard", requiredEquipment: ["Helm"] },
    ];

    expect(programListSchema.safeParse(programs).success).toBe(true);
  });

  it("rejects a list longer than a school could plausibly need", () => {
    const tooMany = namesOfLength(MAX_LIST_ITEMS + 1).map((name) => ({ name }));

    expect(programListSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("eventSchema", () => {
  it("carries a name and the five lists a place may override", () => {
    expect(Object.keys(eventSchema.shape)).toEqual([
      "name",
      "programs",
      "skillLevels",
      "seasonPassOptions",
      "busPickupPoints",
      "foodOptions",
    ]);
  });

  it("requires a non-empty name", () => {
    expect(eventSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  /** Empty means "inherit the series' list" here, unlike anywhere else a list is empty (US-33). */
  it("defaults every one of its five lists to empty, which is what inheriting looks like", () => {
    expect(eventSchema.parse({ name: "Woche 1" })).toEqual({
      name: "Woche 1",
      programs: [],
      skillLevels: [],
      seasonPassOptions: [],
      busPickupPoints: [],
      foodOptions: [],
    });
  });
});

describe("eventListSchema", () => {
  it("keeps the teacher's order rather than sorting by name", () => {
    const events = [{ name: "Woche 2" }, { name: "Woche 1" }];

    expect(eventListSchema.parse(events).map((event) => event.name)).toEqual([
      "Woche 2",
      "Woche 1",
    ]);
  });

  it("accepts an empty list, which is what a series starts with", () => {
    expect(eventListSchema.parse([])).toEqual([]);
  });

  /** A registration stores the name it was assigned (US-11), so two events may not share one. */
  it("rejects two events of the same name, ignoring case and surrounding space", () => {
    expect(eventListSchema.safeParse([{ name: "Woche 1" }, { name: " woche 1 " }]).success).toBe(
      false,
    );
  });

  it("rejects a list longer than a school could plausibly need", () => {
    const tooMany = namesOfLength(MAX_LIST_ITEMS + 1).map((name) => ({ name }));

    expect(eventListSchema.safeParse(tooMany).success).toBe(false);
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
