/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PAGE_PERMISSION, reachablePages, firstReachableHref } from "./reachable-pages";

const SERIES = "s1";

describe("PAGE_PERMISSION", () => {
  it("names a permission for every page a teacher can be sent to", () => {
    for (const permission of Object.values(PAGE_PERMISSION)) {
      expect(PERMISSIONS).toContain(permission);
    }
  });
});

describe("reachablePages", () => {
  it("lists them in the order the navigation shows them", () => {
    expect(reachablePages([...PERMISSIONS])).toEqual([
      "overview",
      "assignment",
      "report",
      "masterData",
      "users",
    ]);
  });

  it("lists only what the permissions reach", () => {
    expect(reachablePages(["editAssignments"])).toEqual(["assignment"]);
  });

  /** Both report pages hang off the one permission, so neither appears without it. */
  it("gives viewReports both the overview and the report", () => {
    expect(reachablePages(["viewReports"])).toEqual(["overview", "report"]);
  });

  it("lists nothing for a teacher holding nothing", () => {
    expect(reachablePages([])).toEqual([]);
  });
});

describe("firstReachableHref", () => {
  it("sends a teacher to the first page they may open", () => {
    expect(firstReachableHref(["editAssignments"], SERIES)).toBe("/app/s1/assignment");
  });

  it("prefers the overview when it is reachable", () => {
    expect(firstReachableHref([...PERMISSIONS], SERIES)).toBe("/app/s1/overview");
  });

  /**
   * The rights page is about the school rather than a series, so it is where somebody holding
   * only that one lands — and it is the one destination that survives having no series at all.
   */
  it("sends an admin with nothing else to the rights page", () => {
    expect(firstReachableHref(["editUsers"], SERIES)).toBe("/app/users");
    expect(firstReachableHref(["editUsers"], null)).toBe("/app/users");
  });

  it("sends somebody whose pages all need a series to the event series list", () => {
    expect(firstReachableHref(["editMasterData"], null)).toBe("/app/event-series");
  });

  it("has nowhere to send a teacher holding nothing", () => {
    expect(firstReachableHref([], SERIES)).toBeNull();
    expect(firstReachableHref([], null)).toBeNull();
  });

  it("has nowhere to send one whose only pages need a series there is none of", () => {
    expect(firstReachableHref(["viewReports"], null)).toBeNull();
  });
});
