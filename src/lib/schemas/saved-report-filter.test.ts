/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import {
  savedReportFilterInputSchema,
  savedReportFilterSchema,
} from "@/lib/schemas/saved-report-filter";

const selection = toggleTag({ ...EMPTY_FILTER, name: "Muster" }, "class", "3AHME");

const without = (category: string) =>
  Object.fromEntries(Object.entries(selection.tags).filter(([key]) => key !== category));

const saved = {
  id: "filter-1",
  createdByUserId: "jane.doe@htldornbirn.at",
  name: "Anwesende Skifahrer",
  filter: selection,
};

describe("savedReportFilterSchema", () => {
  it("stores the selection in the shape the report filters with, not a second spelling of it", () => {
    expect(savedReportFilterSchema.parse(saved)).toEqual(saved);
  });

  it("requires a name, which is all the dropdown has to show it by", () => {
    expect(savedReportFilterSchema.safeParse({ ...saved, name: "  " }).success).toBe(false);
  });

  it("records the teacher who saved it, even though it is shared with all of them", () => {
    expect(savedReportFilterSchema.safeParse({ ...saved, createdByUserId: "" }).success).toBe(
      false,
    );
  });

  it("reads a category added after a filter was saved as no restriction from it", () => {
    const tags = without("event");

    const parsed = savedReportFilterSchema.parse({
      ...saved,
      filter: { ...selection, tags },
    });

    expect(parsed.filter.tags.event).toEqual([]);
  });

  it("keeps only the categories the report filters by", () => {
    const tags = { ...selection.tags, favouriteColour: ["red"] };

    expect(
      savedReportFilterSchema.parse({ ...saved, filter: { ...selection, tags } }).filter,
    ).toEqual(selection);
  });
});

describe("savedReportFilterInputSchema", () => {
  it("takes the name and the selection, which is everything a teacher decides", () => {
    expect(savedReportFilterInputSchema.parse({ name: "5AHIF", filter: selection })).toEqual({
      name: "5AHIF",
      filter: selection,
    });
  });

  it("refuses the author, which the session decides and no request may claim", () => {
    expect(
      savedReportFilterInputSchema.safeParse({
        name: "5AHIF",
        filter: selection,
        createdByUserId: "someone.else@htldornbirn.at",
      }).success,
    ).toBe(false);
  });
});
