/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { accountTypeFromEmail, invitationKey } from "@/lib/auth/school-email";

/**
 * An invitation is the one thing still keyed by an address, and a document id is case-sensitive
 * where an address is not — so "Hannes.Stauss@…" and "hannes.stauss@…" are two keys for one
 * person. Provisioning looks under the folded one, so anything writing an invitation has to
 * fold it too, or the invitation waits at a key nobody ever reads (US-2, US-31).
 */
describe("invitationKey", () => {
  it("folds an address to the one form provisioning looks under", () => {
    expect(invitationKey("  Hannes.Stauss@HTLDornbirn.at ")).toBe("hannes.stauss@htldornbirn.at");
  });

  it("leaves one already in that form alone", () => {
    expect(invitationKey("hannes.stauss@htldornbirn.at")).toBe("hannes.stauss@htldornbirn.at");
  });
});

describe("accountTypeFromEmail", () => {
  it("assigns the teacher role to the staff domain", () => {
    expect(accountTypeFromEmail("jane.doe@htldornbirn.at")).toBe("teacher");
  });

  it("assigns the student role to the student domain", () => {
    expect(accountTypeFromEmail("jane.doe@student.htldornbirn.at")).toBe("student");
  });

  it.each([
    ["Jane.Doe@HTLDornbirn.at", "teacher"],
    ["Jane.Doe@Student.HTLDornbirn.AT", "student"],
  ])("matches %s case-insensitively", (email, expected) => {
    expect(accountTypeFromEmail(email)).toBe(expected);
  });

  it("trims surrounding whitespace", () => {
    expect(accountTypeFromEmail("  jane.doe@htldornbirn.at  ")).toBe("teacher");
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
  ])("rejects %s", (_case, email) => {
    expect(accountTypeFromEmail(email)).toBeNull();
  });
});
