/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { buildEmail, isSchoolEmail } from "@/lib/auth/fake/email-builder";

describe("buildEmail", () => {
  it("joins the two names with a dot and the domain the role maps to", () => {
    expect(buildEmail("Jane", "Doe", "teacher")).toBe("jane.doe@htldornbirn.at");
    expect(buildEmail("Jane", "Doe", "student")).toBe("jane.doe@student.htldornbirn.at");
  });

  it("trims and lowercases what was typed", () => {
    expect(buildEmail("  JANE  ", " Doe ", "teacher")).toBe("jane.doe@htldornbirn.at");
  });

  // A local part is ASCII, so the German spellings have to be written out rather than folded away:
  // dropping the diaeresis would turn Müller into "muller".
  it.each([
    ["Jürgen", "Müller", "juergen.mueller@htldornbirn.at"],
    ["Öznur", "Äbler", "oeznur.aebler@htldornbirn.at"],
    ["Jan", "Weiß", "jan.weiss@htldornbirn.at"],
  ])("writes out umlauts and ß in %s %s", (firstName, lastName, expected) => {
    expect(buildEmail(firstName, lastName, "teacher")).toBe(expected);
  });

  it("strips the remaining diacritics", () => {
    expect(buildEmail("Zoé", "Šimon", "teacher")).toBe("zoe.simon@htldornbirn.at");
  });

  it("keeps hyphenated names hyphenated", () => {
    expect(buildEmail("Anna-Maria", "Bauer-Fink", "student")).toBe(
      "anna-maria.bauer-fink@student.htldornbirn.at",
    );
  });

  it("turns a space inside one name into a hyphen", () => {
    expect(buildEmail("Anna Maria", "van Berg", "teacher")).toBe(
      "anna-maria.van-berg@htldornbirn.at",
    );
  });

  it.each([
    ["an empty first name", "", "Doe"],
    ["a blank last name", "Jane", "   "],
    ["a name with no ASCII letters left", "Jane", "字"],
    ["a name that is only punctuation", "Jane", "-.-"],
  ])("returns null for %s", (_case, firstName, lastName) => {
    expect(buildEmail(firstName, lastName, "teacher")).toBeNull();
  });
});

describe("isSchoolUpn", () => {
  it.each([
    ["jane.doe@htldornbirn.at"],
    ["jane.doe@student.htldornbirn.at"],
    ["anna-maria.bauer-fink@student.htldornbirn.at"],
  ])("accepts %s", (upn) => {
    expect(isSchoolEmail(upn)).toBe(true);
  });

  it.each([
    ["a missing last name", "jane@htldornbirn.at"],
    ["a third name part", "jane.marie.doe@htldornbirn.at"],
    ["a digit", "jane.doe2@htldornbirn.at"],
    ["an underscore", "jane_doe@htldornbirn.at"],
    ["an unrelated domain", "jane.doe@gmail.com"],
    ["a lookalike domain", "jane.doe@evil-htldornbirn.at"],
    ["a suffixed domain", "jane.doe@htldornbirn.at.evil.com"],
    // Left unescaped, the dot in the domain is a wildcard and these would pass.
    ["a staff domain with the dot substituted", "jane.doe@htldornbirnXat"],
    ["a student domain with the dot substituted", "jane.doe@studentXhtldornbirn.at"],
    ["a dangling hyphen", "jane-.doe@htldornbirn.at"],
    ["an empty string", ""],
  ])("rejects %s", (_case, upn) => {
    expect(isSchoolEmail(upn)).toBe(false);
  });
});
