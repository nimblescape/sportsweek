/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "@/lib/schemas/collections";
import {
  MASTER_DATA_CATEGORIES,
  MASTER_DATA_SECTIONS,
  masterDataCategorySchema,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";

describe("MASTER_DATA_CATEGORIES", () => {
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

  it("names the field a program keeps its required equipment in, and gives nothing else one", () => {
    const programs: MasterDataCategory = MASTER_DATA_CATEGORIES.programs;
    const classes: MasterDataCategory = MASTER_DATA_CATEGORIES.classes;

    expect(programs.equipmentField).toBe("requiredEquipment");
    expect(classes.equipmentField).toBeUndefined();
  });

  it("has no category of its own for required equipment, which is a field now", () => {
    expect(Object.keys(MASTER_DATA_CATEGORIES)).not.toContain("required-equipment");
  });

  it("labels every category in German", () => {
    for (const category of Object.values(MASTER_DATA_CATEGORIES)) {
      expect(category.labels.title).not.toBe("");
      expect(category.labels.singular).not.toBe("");
      expect(category.labels.add).toMatch(/^Neue/);
    }
  });
});

describe("MASTER_DATA_SECTIONS", () => {
  it("leads with seasons and adds nothing beyond the categories", () => {
    expect(MASTER_DATA_SECTIONS[0]).toEqual({
      href: "/app/master-data/seasons",
      label: "Saisonen",
    });
    expect(MASTER_DATA_SECTIONS).toHaveLength(Object.keys(MASTER_DATA_CATEGORIES).length + 1);
  });

  it("links each category under its own key, labelled with the title it already carries", () => {
    for (const [key, category] of Object.entries(MASTER_DATA_CATEGORIES)) {
      expect(MASTER_DATA_SECTIONS).toContainEqual({
        href: `/app/master-data/${key}`,
        label: category.labels.title,
      });
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
