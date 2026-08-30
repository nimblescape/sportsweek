/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  asUid,
  documentIdSchema,
  genderSchema,
  optionalText,
  phoneNumberSchema,
  requiredText,
  snapshotValueSchema,
  uidSchema,
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
    expect(documentIdSchema.safeParse("event series-1").success).toBe(true);
  });

  /** An id is opaque: repairing one quietly is how a uid comes to name the wrong document. */
  it("returns the id exactly as it was given", () => {
    expect(documentIdSchema.parse("6Xk2p9QwErTyUiOpAsDf")).toBe("6Xk2p9QwErTyUiOpAsDf");
  });

  it.each([
    ["an empty id", ""],
    ["a path instead of an id", "event series/event series-1"],
    ["an id padded with spaces", " 6Xk2p9QwErTyUiOpAsDf "],
    ["an id that is nothing but spaces", "   "],
  ])("rejects %s", (_case, value) => {
    expect(documentIdSchema.safeParse(value).success).toBe(false);
  });
});

/**
 * A uid and an address are both strings, and the compiler let one stand where the other belonged
 * until a comparison quietly stopped matching. The brand is what makes that a type error; it is
 * a fiction of the type system, so what is carried is still exactly the id that was given.
 */
describe("uidSchema", () => {
  it("carries the uid through unchanged", () => {
    expect(uidSchema.parse("6Xk2p9QwErTyUiOpAsDf")).toBe("6Xk2p9QwErTyUiOpAsDf");
  });

  it("refuses what no document id may be", () => {
    expect(uidSchema.safeParse("a/b").success).toBe(false);
    expect(uidSchema.safeParse("").success).toBe(false);
  });

  /** The way in for a uid the type system cannot see the origin of — a token claim, a document id. */
  it("brands a string a caller vouches for, and refuses one that is no id", () => {
    expect(asUid("6Xk2p9QwErTyUiOpAsDf")).toBe("6Xk2p9QwErTyUiOpAsDf");
    expect(() => asUid(" padded ")).toThrow();
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
