import { describe, expect, it } from "vitest";
import {
  documentIdSchema,
  genderSchema,
  optionalText,
  phoneNumberSchema,
  requiredText,
  snapshotValueSchema,
} from "@/lib/schemas/common";

describe("phoneNumberSchema", () => {
  it.each(["+436601234567", "+43 660 1234567", "+43-660-1234567", "+4366012345"])(
    "accepts the international number %s",
    (value) => {
      expect(phoneNumberSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ["a national number", "06601234567"],
    ["a bare number", "6601234567"],
    ["a country code starting with zero", "+0123456789"],
    ["too few digits", "+43 660"],
    ["letters", "+43 abc defg"],
    ["an empty string", ""],
  ])("rejects %s", (_case, value) => {
    expect(phoneNumberSchema.safeParse(value).success).toBe(false);
  });
});

describe("requiredText", () => {
  it("trims surrounding whitespace", () => {
    expect(requiredText().parse("  Ski  ")).toBe("Ski");
  });

  it.each(["", "   "])("rejects blank input %p", (value) => {
    expect(requiredText().safeParse(value).success).toBe(false);
  });

  it("enforces the maximum length", () => {
    expect(requiredText(5).safeParse("123456").success).toBe(false);
  });
});

describe("optionalText", () => {
  it("accepts null", () => {
    expect(optionalText().parse(null)).toBeNull();
  });

  it("still enforces the maximum length", () => {
    expect(optionalText(5).safeParse("123456").success).toBe(false);
  });
});

describe("documentIdSchema", () => {
  it("accepts a plain id", () => {
    expect(documentIdSchema.safeParse("season-1").success).toBe(true);
  });

  it.each([
    ["an empty id", ""],
    ["a path instead of an id", "seasons/season-1"],
  ])("rejects %s", (_case, value) => {
    expect(documentIdSchema.safeParse(value).success).toBe(false);
  });
});

describe("snapshotValueSchema", () => {
  it("accepts the plain text copied from a teacher-maintained list", () => {
    expect(snapshotValueSchema.safeParse("Ski").success).toBe(true);
  });

  it("rejects a document reference, so values can never be stored as foreign keys", () => {
    expect(snapshotValueSchema.safeParse({ path: "programs/ski" }).success).toBe(false);
  });
});

describe("genderSchema", () => {
  it.each(["male", "female"])("accepts %s", (value) => {
    expect(genderSchema.safeParse(value).success).toBe(true);
  });

  it("rejects any other value", () => {
    expect(genderSchema.safeParse("other").success).toBe(false);
  });
});
