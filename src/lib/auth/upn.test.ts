import { describe, expect, it } from "vitest";
import { roleFromUpn } from "@/lib/auth/upn";

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
