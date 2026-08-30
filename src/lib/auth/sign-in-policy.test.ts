/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refuseSignIn } from "@/lib/auth/sign-in-policy";

/**
 * What a build resolves to unless it opts into the fake login. If the alias in
 * `next.config.ts` were ever to stop matching, this is the behaviour that would be left —
 * which is why it is the safe one.
 */
describe("the production sign-in policy", () => {
  it("admits the school's own directory, whoever it names", () => {
    expect(refuseSignIn({ accountType: "student", signInProvider: "microsoft.com" })).toBeNull();
    expect(refuseSignIn({ accountType: "teacher", signInProvider: "microsoft.com" })).toBeNull();
  });

  /**
   * The address alone proves nothing: an e-mail sign-up asserts whichever it is handed, so a
   * provider switched on in the console would otherwise be a way to be provisioned as staff.
   * Which providers a project offers is not decided in this repository, so this does not
   * assume the answer.
   */
  it.each(["password", "google.com", "anonymous", "phone"])(
    "refuses a sign-in through %s, whatever address it asserts",
    (signInProvider) => {
      expect(refuseSignIn({ accountType: "teacher", signInProvider })).toMatchObject({
        reason: "untrusted-provider",
      });
    },
  );

  /** Firebase sets it on every token it issues, so its absence is not a case to make room for. */
  it("refuses a sign-in that names no provider at all", () => {
    expect(refuseSignIn({ accountType: "teacher" })).toMatchObject({
      reason: "untrusted-provider",
    });
  });

  /** Only a fake login mints one, and production has none — see next.config.ts. */
  it("refuses a token this project's own server signed", () => {
    expect(refuseSignIn({ accountType: "teacher", signInProvider: "custom" })).toMatchObject({
      reason: "untrusted-provider",
    });
  });
});

/** The two modules next.config.ts swaps for a build that opts into the fake login. */
const ALIASED = ["sign-in-policy", "sign-in-view"];

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

/**
 * The swap matches the specifier, not the file. A relative import resolves to the same module,
 * reads identically, and passes every test — while leaving the production implementation in a
 * build that meant to replace it, where only running the app would show it.
 */
describe("the modules a fake-login build swaps", () => {
  it("are imported by the specifier next.config.ts aliases", () => {
    const relative = ALIASED.map((name) => new RegExp(`from "\\.[^"]*/${name}"`));
    const offenders = [...sourceFiles("src")].filter((path) => {
      const source = readFileSync(path, "utf8");
      return relative.some((pattern) => pattern.test(source));
    });

    expect(offenders).toEqual([]);
  });
});
