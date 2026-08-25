/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { MASTER_DATA_SECTIONS } from "@/lib/routes";
import {
  MASTER_DATA_CATEGORIES,
  masterDataCategorySchema,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";

describe("MASTER_DATA_CATEGORIES", () => {
  it("covers every teacher-maintained section except seasons", () => {
    const sectionKeys = MASTER_DATA_SECTIONS.map((section) => section.href.split("/").pop()).filter(
      (key) => key !== "seasons",
    );

    expect(Object.keys(MASTER_DATA_CATEGORIES)).toEqual(expect.arrayContaining(sectionKeys));
  });

  it("points every category at a known collection", () => {
    const known = new Set<string>(Object.values(COLLECTIONS));

    for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
      expect(known).toContain(category.collection);
    }
  });

  it("matches each category against the field student master data snapshots it into", () => {
    expect(MASTER_DATA_CATEGORIES.classes.usage).toEqual({ kind: "masterData", field: "class" });
    expect(MASTER_DATA_CATEGORIES.programs.usage).toEqual({ kind: "masterData", field: "program" });
    expect(MASTER_DATA_CATEGORIES["skill-levels"].usage).toEqual({
      kind: "masterData",
      field: "skillLevel",
    });
    expect(MASTER_DATA_CATEGORIES["bus-pickup-points"].usage).toEqual({
      kind: "masterData",
      field: "busPickupPoint",
    });
    expect(MASTER_DATA_CATEGORIES["food-options"].usage).toEqual({
      kind: "masterData",
      field: "foodOption",
    });
    expect(MASTER_DATA_CATEGORIES["season-pass-options"].usage).toEqual({
      kind: "masterData",
      field: "seasonPassOption",
    });
  });

  it("matches required equipment items through the students' rental selections, not the program", () => {
    expect(MASTER_DATA_CATEGORIES["required-equipment"].usage).toEqual({ kind: "rentalItem" });
  });

  it("scopes required equipment items to their program, and nothing else to a parent", () => {
    const equipment: MasterDataCategory = MASTER_DATA_CATEGORIES["required-equipment"];
    const classes: MasterDataCategory = MASTER_DATA_CATEGORIES.classes;

    expect(equipment.parentField).toBe("programId");
    expect(classes.parentField).toBeUndefined();
  });

  it("names the nested list a program owns, so deleting one can take it along", () => {
    const programs: MasterDataCategory = MASTER_DATA_CATEGORIES.programs;
    const classes: MasterDataCategory = MASTER_DATA_CATEGORIES.classes;

    expect(programs.childKey).toBe("required-equipment");
    expect(classes.childKey).toBeUndefined();
  });

  it("labels every category in German", () => {
    for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
      expect(category.labels.title).not.toBe("");
      expect(category.labels.singular).not.toBe("");
      expect(category.labels.add).toMatch(/^Neue/);
    }
  });
});

describe("masterDataCategorySchema", () => {
  it("accepts every known key", () => {
    for (const key of Object.keys(MASTER_DATA_CATEGORIES) as MasterDataCategoryKey[]) {
      expect(masterDataCategorySchema.safeParse(key).success).toBe(true);
    }
  });

  it("rejects an unknown key, so a URL segment cannot name a collection", () => {
    expect(masterDataCategorySchema.safeParse("users").success).toBe(false);
    expect(masterDataCategorySchema.safeParse("../users").success).toBe(false);
  });
});
