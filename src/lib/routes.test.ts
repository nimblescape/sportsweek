/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { ROUTES, safeDestination } from "@/lib/routes";

/**
 * `next` is read from the address bar, so it is a stranger's text however it got there. The
 * sign-in navigates to whatever it says, which is the whole of an open redirect: a link to this
 * application's own sign-in page that lands somewhere else entirely.
 */
describe("safeDestination", () => {
  it("keeps a path within this application", () => {
    expect(safeDestination("/app/s1/report", ROUTES.appRoot)).toBe("/app/s1/report");
  });

  it("falls back when nothing was asked for", () => {
    expect(safeDestination(null, ROUTES.appRoot)).toBe(ROUTES.appRoot);
  });

  it.each([
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example/phish",
    "javascript:alert(1)",
  ])("refuses %s, which leaves this application", (destination) => {
    expect(safeDestination(destination, ROUTES.appRoot)).toBe(ROUTES.appRoot);
  });

  /** A backslash is a slash to some browsers, so `/\evil.example` is another way of writing `//`. */
  it("refuses a path that starts with a backslash", () => {
    expect(safeDestination("/\\evil.example", ROUTES.appRoot)).toBe(ROUTES.appRoot);
  });

  it("refuses anything that is not an absolute path", () => {
    expect(safeDestination("app/s1/report", ROUTES.appRoot)).toBe(ROUTES.appRoot);
  });
});
