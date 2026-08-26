/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { buildUpn, isSchoolUpn, roleFromUpn } from "@/lib/auth/upn";

describe("roleFromUpn", () => {
  it("assigns the teacher role to the staff domain", () => {
    expect(roleFromUpn("jane.doe@htldornbirn.at")).toBe("teacher");
  });

  it("assigns the student role to the student domain", () => {
    expect(roleFromUpn("jane.doe@student.htldornbirn.at")).toBe("student");
  });

  it.each([
    ["Jane.Doe@HTLDornbirn.at", "teacher"],
    ["Jane.Doe@Student.HTLDornbirn.AT", "student"],
  ])("matches %s case-insensitively", (upn, expected) => {
    expect(roleFromUpn(upn)).toBe(expected);
  });

  it("trims surrounding whitespace", () => {
    expect(roleFromUpn("  jane.doe@htldornbirn.at  ")).toBe("teacher");
  });

  it.each([
    ["a lookalike domain", "jane@evil-htldornbirn.at"],
    ["an unexpected subdomain", "jane@mail.htldornbirn.at"],
    ["a suffixed staff domain", "jane@htldornbirn.at.evil.com"],
    ["a suffixed student domain", "jane@student.htldornbirn.at.evil.com"],
    ["a deeper student subdomain", "jane@a.student.htldornbirn.at"],
    ["an unrelated domain", "jane@gmail.com"],
    ["an empty string", ""],
    ["a bare local part", "jane"],
    ["a missing local part", "@htldornbirn.at"],
    ["a missing domain", "jane@"],
    ["two at signs", "jane@evil.com@htldornbirn.at"],
  ])("rejects %s", (_case, upn) => {
    expect(roleFromUpn(upn)).toBeNull();
  });
});

describe("buildUpn", () => {
  it("joins the two names with a dot and the domain the role maps to", () => {
    expect(buildUpn("Jane", "Doe", "teacher")).toBe("jane.doe@htldornbirn.at");
    expect(buildUpn("Jane", "Doe", "student")).toBe("jane.doe@student.htldornbirn.at");
  });

  it("trims and lowercases what was typed", () => {
    expect(buildUpn("  JANE  ", " Doe ", "teacher")).toBe("jane.doe@htldornbirn.at");
  });

  // A UPN is ASCII, so the German spellings have to be written out rather than folded away:
  // dropping the diaeresis would turn Müller into "muller".
  it.each([
    ["Jürgen", "Müller", "juergen.mueller@htldornbirn.at"],
    ["Öznur", "Äbler", "oeznur.aebler@htldornbirn.at"],
    ["Jan", "Weiß", "jan.weiss@htldornbirn.at"],
  ])("writes out umlauts and ß in %s %s", (firstName, lastName, expected) => {
    expect(buildUpn(firstName, lastName, "teacher")).toBe(expected);
  });

  it("strips the remaining diacritics", () => {
    expect(buildUpn("Zoé", "Šimon", "teacher")).toBe("zoe.simon@htldornbirn.at");
  });

  it("keeps hyphenated names hyphenated", () => {
    expect(buildUpn("Anna-Maria", "Bauer-Fink", "student")).toBe(
      "anna-maria.bauer-fink@student.htldornbirn.at",
    );
  });

  it("turns a space inside one name into a hyphen", () => {
    expect(buildUpn("Anna Maria", "van Berg", "teacher")).toBe(
      "anna-maria.van-berg@htldornbirn.at",
    );
  });

  it.each([
    ["an empty first name", "", "Doe"],
    ["a blank last name", "Jane", "   "],
    ["a name with no ASCII letters left", "Jane", "字"],
    ["a name that is only punctuation", "Jane", "-.-"],
  ])("returns null for %s", (_case, firstName, lastName) => {
    expect(buildUpn(firstName, lastName, "teacher")).toBeNull();
  });
});

describe("isSchoolUpn", () => {
  it.each([
    ["jane.doe@htldornbirn.at"],
    ["jane.doe@student.htldornbirn.at"],
    ["anna-maria.bauer-fink@student.htldornbirn.at"],
  ])("accepts %s", (upn) => {
    expect(isSchoolUpn(upn)).toBe(true);
  });

  it.each([
    ["a missing last name", "jane@htldornbirn.at"],
    ["a third name part", "jane.marie.doe@htldornbirn.at"],
    ["a digit", "jane.doe2@htldornbirn.at"],
    ["an underscore", "jane_doe@htldornbirn.at"],
    ["an unrelated domain", "jane.doe@gmail.com"],
    ["a lookalike domain", "jane.doe@evil-htldornbirn.at"],
    ["a suffixed domain", "jane.doe@htldornbirn.at.evil.com"],
    ["a dangling hyphen", "jane-.doe@htldornbirn.at"],
    ["an empty string", ""],
  ])("rejects %s", (_case, upn) => {
    expect(isSchoolUpn(upn)).toBe(false);
  });
});
