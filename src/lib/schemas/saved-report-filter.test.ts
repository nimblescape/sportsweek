import { describe, expect, it } from "vitest";
import { savedReportFilterSchema } from "@/lib/schemas/saved-report-filter";

const validFilter = {
  id: "filter-1",
  createdByUserId: "jane.doe@htldornbirn.at",
  name: "Anwesende Skifahrer",
  classFilter: ["3AHME"],
  genderFilter: ["female"],
  programFilter: ["Ski"],
  skillLevelFilter: null,
  attendingFilter: [true],
  nameTextFilter: null,
};

describe("savedReportFilterSchema", () => {
  it("parses a valid saved filter", () => {
    expect(savedReportFilterSchema.parse(validFilter)).toEqual(validFilter);
  });

  it("requires a name", () => {
    expect(savedReportFilterSchema.safeParse({ ...validFilter, name: "  " }).success).toBe(false);
  });

  it("records the teacher who saved it, even though it is shared", () => {
    expect(savedReportFilterSchema.safeParse({ ...validFilter, createdByUserId: "" }).success).toBe(
      false,
    );
  });

  it.each([
    "classFilter",
    "genderFilter",
    "programFilter",
    "skillLevelFilter",
    "attendingFilter",
    "nameTextFilter",
  ])("treats %s as unrestricted when null", (field) => {
    expect(savedReportFilterSchema.safeParse({ ...validFilter, [field]: null }).success).toBe(true);
  });

  it("rejects an invalid gender tag", () => {
    expect(
      savedReportFilterSchema.safeParse({ ...validFilter, genderFilter: ["diverse"] }).success,
    ).toBe(false);
  });
});
