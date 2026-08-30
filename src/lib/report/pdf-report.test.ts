/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { ContextPageSize, DynamicContent } from "pdfmake/interfaces";
import { pageLabel, reportDocument } from "./pdf-report";
import type { ReportProvenance } from "./report-export";
import { reportFieldsOf } from "./report-fields";
import { rosterStudent } from "@/test/roster-student";

const ANNA = rosterStudent({ id: "r1", firstName: "Anna", lastName: "Muster" });
const BENE = rosterStudent({
  id: "r2",
  firstName: "Bene",
  lastName: "Berger",
  email: "bene@student.htldornbirn.at",
  class: "5BHIF",
});

const PROVENANCE: ReportProvenance = {
  reportName: null,
  filterSummary: null,
  exportedAt: new Date(2026, 7, 27, 14, 35),
  build: "v1.2.3 \u00b7 abc1234",
};
const A4: ContextPageSize = { width: 595, height: 842, orientation: "portrait" };

const document = (
  students = [ANNA, BENE],
  fields = reportFieldsOf([]),
  provenance = PROVENANCE,
  logo: string | null = "data:image/png;base64,AAA",
) => reportDocument(students, fields, { provenance, logo });

/** Everything a piece of the document would put on the page, whatever it is nested in. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node === null || typeof node !== "object") return "";

  const parts = node as Record<string, unknown>;
  return [parts.text, parts.stack, parts.columns].map(textOf).join(" ");
}

const footerOf = (definition = document(), page = 3, pages = 12) =>
  textOf((definition.footer as DynamicContent)(page, pages, A4));

describe("reportDocument", () => {
  it("holds exactly the students it was handed, and nobody else", () => {
    const only = textOf(document([ANNA]).content);

    expect(only).toContain("Anna Muster");
    expect(only).not.toContain("Bene Berger");
  });

  it("keeps the e-mail address on the master line, as the screen does", () => {
    expect(textOf(document([BENE]).content)).toContain("(bene@student.htldornbirn.at)");
  });

  it("gives each activated field one detail line under its student", () => {
    const content = textOf(document([BENE], reportFieldsOf(["class", "gender"])).content);

    expect(content).toContain("Klasse:");
    expect(content).toContain("5BHIF");
    expect(content).toContain("Geschlecht:");
  });

  it("reduces a student to their master line while no field is activated", () => {
    expect(textOf(document([ANNA]).content)).not.toContain("Klasse:");
  });

  it("says a field is unanswered rather than leaving the line blank", () => {
    expect(textOf(document([ANNA], reportFieldsOf(["health"])).content)).toContain("keine Angabe");
  });

  it("marks a registration that is still missing answers", () => {
    const chasing = rosterStudent({ id: "r3", lastName: "Cerny" }, { isIncomplete: true });

    expect(textOf(document([chasing]).content)).toContain("Registrierung unvollständig");
    expect(textOf(document([ANNA]).content)).not.toContain("Registrierung unvollständig");
  });

  it("keeps a student's master line and detail lines on one page", () => {
    const blocks = document([ANNA, BENE], reportFieldsOf(["class"])).content;

    expect(Array.isArray(blocks)).toBe(true);
    for (const block of blocks as unknown as Record<string, unknown>[]) {
      expect(block.unbreakable).toBe(true);
      expect(block.stack).toHaveLength(2);
    }
  });

  it("says so where the filter leaves nobody, rather than handing over a blank page", () => {
    expect(textOf(document([]).content)).toContain("Keine Schüler:innen gefunden.");
  });

  it("puts the title on the left and the logo on the right", () => {
    const { columns } = document().header as { columns: unknown[] };

    expect(textOf(columns[0])).toContain("Sportsweek Report");
    expect(JSON.stringify(columns[1])).toContain("data:image/png;base64,AAA");
  });

  it("keeps the title in the header when the logo could not be loaded", () => {
    expect(textOf(document([ANNA], reportFieldsOf([]), PROVENANCE, null).header)).toContain(
      "Sportsweek Report",
    );
  });

  it("states the page and the total in the footer of whichever page it is drawn on", () => {
    expect(footerOf(document(), 3, 12)).toContain(pageLabel(3, 12));
    expect(footerOf(document(), 1, 12)).toContain("Seite 1 von 12");
  });

  it("states in the footer when the copy was taken", () => {
    expect(footerOf()).toContain("Erstellt am 27.08.2026, 14:35");
  });

  /** A printout outlives the deployment that made it, and "which version is this?" is asked of
   * the paper rather than of the screen (US-17). */
  it("states in the footer which build made the copy, after the moment it was taken", () => {
    expect(footerOf()).toContain("Erstellt am 27.08.2026, 14:35 \u00b7 v1.2.3 \u00b7 abc1234");
  });

  it("names the saved filter under the title rather than in the footer", () => {
    const named = document([ANNA], reportFieldsOf([]), {
      ...PROVENANCE,
      reportName: "Nur 5BHIF",
    });

    expect(textOf(named.header)).toContain("Nur 5BHIF");
    expect(footerOf(named)).not.toContain("Nur 5BHIF");
  });

  it("puts the filter under the saved report's name, as a second subtitle line", () => {
    const both = document([ANNA], reportFieldsOf([]), {
      ...PROVENANCE,
      reportName: "Nur 5BHIF",
      filterSummary: "5BHIF \u00b7 weiblich",
    });

    const [title] = (both.header as { columns: { stack: { text: string }[] }[] }).columns;
    expect(title.stack.map((line) => line.text)).toEqual([
      "Sportsweek Report",
      "Nur 5BHIF",
      "5BHIF \u00b7 weiblich",
    ]);
  });

  it("describes the filter under the title where no saved report names the selection", () => {
    const filtered = document([ANNA], reportFieldsOf([]), {
      ...PROVENANCE,
      filterSummary: "5BHIF",
    });

    expect(textOf(filtered.header)).toContain("5BHIF");
  });

  it("leaves the title without a subtitle where the selection matches no saved filter", () => {
    expect(textOf(document().header)).not.toContain("Filter:");
  });
});
