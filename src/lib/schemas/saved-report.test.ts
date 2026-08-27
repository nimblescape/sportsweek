/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import {
  savedReportEditSchema,
  savedReportInputSchema,
  savedReportSchema,
} from "@/lib/schemas/saved-report";

const selection = toggleTag({ ...EMPTY_FILTER, name: "Muster" }, "class", "3AHME");

const without = (category: string) =>
  Object.fromEntries(Object.entries(selection.tags).filter(([key]) => key !== category));

const saved = {
  id: "report-1",
  createdByUserId: "jane.doe@htldornbirn.at",
  name: "Anwesende Skifahrer",
  filter: selection,
  fields: ["class", "contact"],
};

describe("savedReportSchema", () => {
  it("stores both selections in the shape the report works in, not a second spelling of them", () => {
    expect(savedReportSchema.parse(saved)).toEqual(saved);
  });

  it("requires a name, which is all the tag has to show it by", () => {
    expect(savedReportSchema.safeParse({ ...saved, name: "  " }).success).toBe(false);
  });

  it("records the teacher who saved it, even though it is shared with all of them", () => {
    expect(savedReportSchema.safeParse({ ...saved, createdByUserId: "" }).success).toBe(false);
  });

  it("reads a report saved before it held fields as one that shows no detail lines", () => {
    const beforeFields = Object.fromEntries(
      Object.entries(saved).filter(([key]) => key !== "fields"),
    );

    expect(savedReportSchema.parse(beforeFields).fields).toEqual([]);
  });

  it("reads a category added after a report was saved as no restriction from it", () => {
    const tags = without("event");

    const parsed = savedReportSchema.parse({ ...saved, filter: { ...selection, tags } });

    expect(parsed.filter.tags.event).toEqual([]);
  });

  it("keeps only the categories the report filters by", () => {
    const tags = { ...selection.tags, favouriteColour: ["red"] };

    expect(savedReportSchema.parse({ ...saved, filter: { ...selection, tags } }).filter).toEqual(
      selection,
    );
  });
});

describe("savedReportInputSchema", () => {
  it("takes the name and both selections, which is everything a teacher decides", () => {
    const input = { name: "5AHIF", filter: selection, fields: ["class"] };

    expect(savedReportInputSchema.parse(input)).toEqual(input);
  });

  it("refuses the author, which the session decides and no request may claim", () => {
    expect(
      savedReportInputSchema.safeParse({
        name: "5AHIF",
        filter: selection,
        fields: [],
        createdByUserId: "someone.else@htldornbirn.at",
      }).success,
    ).toBe(false);
  });
});

describe("savedReportEditSchema", () => {
  it("takes a new name on its own, which is what renaming a tag sends", () => {
    expect(savedReportEditSchema.parse({ name: "5AHIF" })).toEqual({ name: "5AHIF" });
  });

  it("takes both selections on their own, which is what bringing one up to date sends", () => {
    const edit = { filter: selection, fields: ["class"] };

    expect(savedReportEditSchema.parse(edit)).toEqual(edit);
  });

  it("refuses renaming and rewriting at once, rather than performing half of it", () => {
    expect(
      savedReportEditSchema.safeParse({ name: "5AHIF", filter: selection, fields: [] }).success,
    ).toBe(false);
  });

  it("refuses the author, which the session decides and no request may claim", () => {
    expect(
      savedReportEditSchema.safeParse({
        filter: selection,
        fields: [],
        createdByUserId: "someone.else@htldornbirn.at",
      }).success,
    ).toBe(false);
  });
});
