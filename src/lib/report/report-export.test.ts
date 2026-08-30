/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { exportedAtLine, exportFileName, germanDateTime, subtitleLines } from "./report-export";

const AT = new Date(2026, 7, 27, 14, 35);

describe("germanDateTime", () => {
  it("reads as the rest of the German interface writes a date", () => {
    expect(germanDateTime(AT)).toBe("27.08.2026, 14:35");
  });

  it("pads a single-digit day, month, hour and minute", () => {
    expect(germanDateTime(new Date(2026, 0, 5, 9, 7))).toBe("05.01.2026, 09:07");
  });
});

describe("the lines both exports share", () => {
  it("says when the copy was taken", () => {
    expect(exportedAtLine(AT)).toBe("Erstellt am 27.08.2026, 14:35");
  });
});

describe("subtitleLines", () => {
  const provenance = { reportName: null, filterSummary: null, exportedAt: AT, build: "v1.2.3" };

  it("names the saved report first and the filter that produced it below", () => {
    const named = { ...provenance, reportName: "Nur 5BHIF", filterSummary: "5BHIF" };

    expect(subtitleLines(named)).toEqual(["Nur 5BHIF", "5BHIF"]);
  });

  it("still describes the filter where no saved report names the selection", () => {
    expect(subtitleLines({ ...provenance, filterSummary: "5BHIF" })).toEqual(["5BHIF"]);
  });

  it("names a saved report that restricts nothing on its own", () => {
    expect(subtitleLines({ ...provenance, reportName: "Alle" })).toEqual(["Alle"]);
  });

  it("says nothing about an unfiltered report nobody saved", () => {
    expect(subtitleLines(provenance)).toEqual([]);
  });
});

describe("exportFileName", () => {
  it("falls back to the report's own title where no saved filter names the selection", () => {
    expect(exportFileName({ reportName: null, exportedAt: AT }, "pdf")).toBe(
      "Sportsweek Report - 2026-08-27 14-35.pdf",
    );
  });

  it("is named after the saved filter whose selection is shown", () => {
    expect(exportFileName({ reportName: "Nur 5BHIF", exportedAt: AT }, "xlsx")).toBe(
      "Nur 5BHIF - 2026-08-27 14-35.xlsx",
    );
  });

  it("leads with the year, so a folder of exports sorts into the order they were taken in", () => {
    const earlier = exportFileName(
      { reportName: null, exportedAt: new Date(2026, 0, 2, 8, 5) },
      "pdf",
    );
    const later = exportFileName({ reportName: null, exportedAt: AT }, "pdf");

    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it("keeps a teacher's wording out of the path, since a file name is not free text", () => {
    const name = exportFileName({ reportName: "5B/6B: alles?", exportedAt: AT }, "pdf");

    expect(name).toBe("5B 6B alles - 2026-08-27 14-35.pdf");
    expect(name).not.toContain("/");
  });

  it("falls back to the title where a name is nothing but characters it had to drop", () => {
    expect(exportFileName({ reportName: "///", exportedAt: AT }, "pdf")).toBe(
      "Sportsweek Report - 2026-08-27 14-35.pdf",
    );
  });
});
