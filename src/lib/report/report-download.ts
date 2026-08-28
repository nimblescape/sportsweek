/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { exportFileName, type ReportProvenance } from "./report-export";
import { PDF_FONTS, reportDocument } from "./pdf-report";
import type { ReportField } from "./report-fields";
import type { RosterStudent } from "@/lib/students/roster";

/** What a teacher is told when an export could not be built (US-17, US-18). */
export const EXPORT_FAILED_HINT =
  "Der Export konnte nicht erstellt werden. Bitte versuche es erneut.";

const LOGO_URL = "/htl-logo.png";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReportExport = {
  students: readonly RosterStudent[];
  fields: readonly ReportField[];
  provenance: ReportProvenance;
};

/**
 * The logo as base64, which is the one form both a PDF image and an xlsx image take. A copy
 * without it is still the report, so a logo that did not load costs the letterhead and not
 * the export.
 */
async function logoBase64(): Promise<string | null> {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  } catch {
    return null;
  }
}

/** The browser decides where a download lands, so the export is one press and no dialog (US-17). */
function handOver(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari cancels a download whose object URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type PdfMake = typeof import("pdfmake/build/pdfmake");

/**
 * pdfmake is one object whose methods assign to `this`, and the namespace an `import()` hands
 * back is read-only — calling `setFonts` through it throws. The instance is the default export,
 * which not every bundler synthesises, so take it where it is.
 */
async function loadPdfMake(): Promise<PdfMake> {
  const loaded = await import("pdfmake/build/pdfmake");
  return (loaded as unknown as { default?: PdfMake }).default ?? loaded;
}

/**
 * Built here rather than fetched from a server, because the filter and the activated fields are
 * the client's own state — and because a class full of contact details has no business in a URL.
 */
export async function downloadReportPdf({
  students,
  fields,
  provenance,
}: ReportExport): Promise<void> {
  const logo = await logoBase64();
  const definition = reportDocument(students, fields, {
    provenance,
    logo: logo === null ? null : `data:image/png;base64,${logo}`,
  });

  // Loaded on the press: neither library has anything to say until a teacher asks for a file.
  const pdfMake = await loadPdfMake();
  const { default: fontFiles } = await import("pdfmake/build/vfs_fonts");

  pdfMake.addVirtualFileSystem(fontFiles);
  pdfMake.setFonts(PDF_FONTS);
  // The only image is the data URL above, so the document has no business fetching anything.
  pdfMake.setUrlAccessPolicy(() => false);

  handOver(await pdfMake.createPdf(definition).getBlob(), exportFileName(provenance, "pdf"));
}

export async function downloadReportWorkbook({
  students,
  fields,
  provenance,
}: ReportExport): Promise<void> {
  const logo = await logoBase64();
  const { reportWorkbook } = await import("./excel-report");
  const workbook = reportWorkbook(students, fields, { provenance, logo });

  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_MIME });
  handOver(blob, exportFileName(provenance, "xlsx"));
}
