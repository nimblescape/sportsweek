/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { skillColumnKey } from "@/lib/assignment/statistics";
import { SkillMatrix } from "./skill-matrix";

const PROGRAMS = ["Ski", "Snowboard"];
const SKILL_LEVELS = ["Keine Vorkenntnisse", "Fortgeschritten"];

const headersOf = (role: "columnheader" | "rowheader") =>
  within(screen.getByRole("table"))
    .getAllByRole(role)
    .map((cell) => cell.textContent);

const cells = () =>
  within(screen.getByRole("table"))
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("SkillMatrix", () => {
  it("lays the programs across and the skill levels down", () => {
    render(<SkillMatrix counts={{}} programs={PROGRAMS} skillLevels={SKILL_LEVELS} />);

    expect(headersOf("columnheader")).toEqual(["", ...PROGRAMS]);
    expect(headersOf("rowheader")).toEqual(SKILL_LEVELS);
  });

  /**
   * An empty list is a question nobody was asked (US-21), so the dimension that is left keeps
   * its own headings and the counts fall on one line named for what they are.
   */
  it("counts the programs on one line where the series has no skill levels", () => {
    const counts = { [skillColumnKey("Ski", null)]: 3, [skillColumnKey("Snowboard", null)]: 1 };

    render(<SkillMatrix counts={counts} programs={PROGRAMS} skillLevels={[]} />);

    expect(headersOf("columnheader")).toEqual(["", ...PROGRAMS]);
    expect(headersOf("rowheader")).toEqual(["Anzahl"]);
    expect(cells()).toEqual(["3", "1"]);
  });

  it("counts the skill levels on one line where the series has no programs", () => {
    const counts = { [skillColumnKey(null, "Fortgeschritten")]: 2 };

    render(<SkillMatrix counts={counts} programs={[]} skillLevels={SKILL_LEVELS} />);

    expect(headersOf("columnheader")).toEqual(["", "Anzahl"]);
    expect(headersOf("rowheader")).toEqual(SKILL_LEVELS);
    expect(cells()).toEqual(["0", "2"]);
  });
});
