/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { formatLoginTime, localTimestamp, SCHOOL_TIME_ZONE } from "@/lib/auth/login-time";

describe("localTimestamp", () => {
  it("reads as the school's own clock in summer, two hours ahead of UTC", () => {
    expect(localTimestamp(new Date("2026-08-29T15:04:05Z"))).toBe("2026-08-29T17:04:05+02:00");
  });

  // The offset is carried rather than assumed, so a winter reading is not two hours out.
  it("follows the change to winter time", () => {
    expect(localTimestamp(new Date("2026-01-15T15:04:05Z"))).toBe("2026-01-15T16:04:05+01:00");
  });

  it("carries the day over when the school's clock is already past midnight", () => {
    expect(localTimestamp(new Date("2026-08-29T23:30:00Z"))).toBe("2026-08-30T01:30:00+02:00");
  });

  // Some locales spell the first hour of a day 24, which would name the day before it.
  it("writes midnight as the start of its own day", () => {
    expect(localTimestamp(new Date("2026-08-29T22:00:00Z"))).toBe("2026-08-30T00:00:00+02:00");
  });

  it("pads every field, so one reading is as wide as the next", () => {
    expect(localTimestamp(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T04:04:05+01:00");
  });

  it("names the school's time zone, which is the one it is read in", () => {
    expect(SCHOOL_TIME_ZONE).toBe("Europe/Vienna");
  });
});

describe("formatLoginTime", () => {
  it("reads a stored sign-in the way the school reads a date, weekday first", () => {
    expect(formatLoginTime("2026-09-06T14:30:45+02:00")).toBe("So., 06.09.2026, 14:30:45");
  });

  it("shows the offset the value was stored in, not the reader's own", () => {
    expect(formatLoginTime("2026-01-15T16:04:05+01:00")).toBe("Do., 15.01.2026, 16:04:05");
  });
});
