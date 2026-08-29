/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { PERMISSIONS, FULL_PERMISSIONS } from "@/lib/auth/permissions";
import { PAGE_PERMISSIONS, reachablePages, firstReachableHref } from "./reachable-pages";

const SERIES = "s1";

describe("PAGE_PERMISSIONS", () => {
  it("names permissions that exist for every page a teacher can be sent to", () => {
    for (const opens of Object.values(PAGE_PERMISSIONS)) {
      expect(opens.length).toBeGreaterThan(0);
      for (const permission of opens) expect(PERMISSIONS).toContain(permission);
    }
  });
});

describe("reachablePages", () => {
  it("lists them in the order the navigation shows them", () => {
    expect(reachablePages([...FULL_PERMISSIONS])).toEqual([
      "registrations",
      "assignment",
      "report",
      "masterData",
      "users",
    ]);
  });

  it("lists only what the permissions reach", () => {
    expect(reachablePages(["editAssignments"])).toEqual(["assignment"]);
  });

  /** The overview is where registrations are invited and removed, not where reports are read. */
  it("gives the overview to whoever may edit registrations", () => {
    expect(reachablePages(["editRegistrations"])).toEqual(["registrations"]);
  });

  it("opens the report page with either of the two that exclude each other", () => {
    expect(reachablePages(["viewReports"])).toEqual(["report"]);
    expect(reachablePages(["editReports"])).toEqual(["report"]);
  });

  it("no longer gives the overview to somebody who may only read reports", () => {
    expect(reachablePages(["viewReports"])).not.toContain("registrations");
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
    expect(firstReachableHref([...FULL_PERMISSIONS], SERIES)).toBe("/app/s1/registrations");
  });

  it("sends somebody who may only edit reports to the report page", () => {
    expect(firstReachableHref(["editReports"], SERIES)).toBe("/app/s1/report");
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
