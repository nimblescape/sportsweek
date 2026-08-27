/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { reportFieldsOf } from "@/lib/report/report-fields";
import { rosterStudent } from "@/test/roster-student";
import { printableReportHtml } from "./printable-report";

const ANNA = rosterStudent({ id: "r1", firstName: "Anna", lastName: "Muster" });
const BENE = rosterStudent({
  id: "r2",
  firstName: "Bene",
  lastName: "Berger",
  email: "bene@student.htldornbirn.at",
  class: "5BHIF",
});

const html = (students = [ANNA, BENE], fields = reportFieldsOf([])) =>
  printableReportHtml(students, fields, { heading: "Bericht – Saison 2026" });

describe("printableReportHtml", () => {
  it("is a document of its own, in the language the report is written in", () => {
    expect(html()).toMatch(/^<!doctype html>/);
    expect(html()).toContain('<html lang="de">');
    expect(html()).toContain("<title>Bericht – Saison 2026</title>");
  });

  it("prints exactly the students it was handed, and nobody else", () => {
    const printed = html([ANNA]);

    expect(printed).toContain("Anna Muster");
    expect(printed).not.toContain("Bene Berger");
  });

  it("keeps the e-mail address on the master line, as on screen", () => {
    expect(html([BENE])).toContain(
      '<p class="name">Bene Berger <span class="email">(bene@student.htldornbirn.at)</span></p>',
    );
  });

  it("gives each activated field one detail line under its student", () => {
    const printed = html([BENE], reportFieldsOf(["class", "gender"]));

    expect(printed).toContain("<dt>Klasse:</dt><dd>5BHIF</dd>");
    expect(printed).toContain("<dt>Geschlecht:</dt><dd>Weiblich</dd>");
  });

  it("reduces a student to their master line while no field is activated", () => {
    expect(html([ANNA])).not.toContain("<dt>");
  });

  it("says which registrations are still missing answers, as the screen does", () => {
    const chasing = rosterStudent({ id: "r3", lastName: "Cerny" }, { isIncomplete: true });

    expect(html([chasing])).toContain("Anmeldung unvollständig");
    expect(html([ANNA])).not.toContain("Anmeldung unvollständig");
  });

  it("carries no navigation, buttons or other chrome onto paper", () => {
    const printed = html(undefined, reportFieldsOf(["class"]));

    for (const tag of ["<button", "<nav", "<a ", "<input", "<script"]) {
      expect(printed).not.toContain(tag);
    }
  });

  it("keeps a student's detail lines on the page their master line is on", () => {
    expect(html()).toContain("break-inside: avoid");
  });

  it("escapes what a student typed, so a name can never become markup", () => {
    const injected = rosterStudent(
      { id: "r4", firstName: "<script>alert(1)</script>", lastName: "Böse" },
      { healthNotes: '"><img src=x onerror=alert(1)>' },
    );

    const printed = printableReportHtml([injected], reportFieldsOf(["health"]), {
      heading: "Bericht",
    });

    expect(printed).not.toContain("<script>alert(1)</script>");
    expect(printed).not.toContain("<img src=x");
    expect(printed).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("says a field is unanswered rather than printing an empty line", () => {
    const blank = rosterStudent({ id: "r5" }, { healthNotes: null });

    expect(printableReportHtml([blank], reportFieldsOf(["health"]), { heading: "B" })).toContain(
      "keine Angabe",
    );
  });
});
