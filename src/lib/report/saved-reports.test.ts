/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { savedReportPath } from "./saved-reports";

describe("savedReportPath", () => {
  it("puts a report beneath the event series it belongs to", () => {
    expect(savedReportPath("s1")).toBe("eventSeries/s1/savedReports");
  });

  /** Two series filter on lists of their own, so a report of one is no report of the other. */
  it("keeps each series' reports apart", () => {
    expect(savedReportPath("s1")).not.toBe(savedReportPath("s2"));
  });
});
