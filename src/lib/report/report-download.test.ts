/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadReportPdf, downloadReportWorkbook, type ReportExport } from "./report-download";
import { reportFieldsOf } from "./report-fields";
import { rosterStudent } from "@/test/roster-student";

const logo = await readFile("public/htl-logo.png");

const REPORT: ReportExport = {
  students: [rosterStudent({ id: "r1", firstName: "Anna", lastName: "Müller-Groß" })],
  fields: reportFieldsOf(["class", "contact"]),
  provenance: { reportName: null, filterSummary: null, exportedAt: new Date(2026, 7, 27, 14, 35) },
};

const fileNames: string[] = [];
const blobs: Blob[] = [];

beforeEach(() => {
  fileNames.length = 0;
  blobs.length = 0;

  vi.stubGlobal("fetch", async () => ({
    ok: true,
    arrayBuffer: async () => logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength),
  }));

  // jsdom has neither, and the blob is the only place the built file can be read from.
  URL.createObjectURL = (blob) => {
    blobs.push(blob as Blob);
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    fileNames.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const firstBytes = async (count: number) =>
  new Uint8Array((await blobs[0].arrayBuffer()).slice(0, count));

/**
 * What the document and the workbook hold is asserted where they are built. What these prove is
 * that the libraries can be reached and driven from a browser at all: an earlier version called
 * pdfmake through the namespace an `import()` returns, which type-checks, builds, and throws the
 * moment a teacher presses the button.
 */
describe("downloadReportPdf", () => {
  it("hands the browser a PDF under the report's own name", async () => {
    await downloadReportPdf(REPORT);

    expect(fileNames).toEqual(["Sportsweek Report - 2026-08-27 14-35.pdf"]);
    expect(new TextDecoder().decode(await firstBytes(5))).toBe("%PDF-");
  });

  it("names it after the saved filter whose selection is being exported", async () => {
    await downloadReportPdf({
      ...REPORT,
      provenance: { ...REPORT.provenance, reportName: "Nur 5BHIF" },
    });

    expect(fileNames).toEqual(["Nur 5BHIF - 2026-08-27 14-35.pdf"]);
  });

  it("still builds one when the logo could not be fetched", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false }));

    await downloadReportPdf(REPORT);

    expect(new TextDecoder().decode(await firstBytes(5))).toBe("%PDF-");
  });
});

describe("downloadReportWorkbook", () => {
  it("hands the browser a workbook under the same name, with the other extension", async () => {
    await downloadReportWorkbook(REPORT);

    expect(fileNames).toEqual(["Sportsweek Report - 2026-08-27 14-35.xlsx"]);
    // The zip magic every xlsx starts with.
    expect(await firstBytes(2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });
});
