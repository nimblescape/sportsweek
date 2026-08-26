/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ClassRow, SkillColumn } from "@/lib/assignment/statistics";

/** Whole per cent: the figure answers "roughly how many of them are coming", not to a decimal. */
const asPercent = (share: number) => `${Math.round(share * 100)} %`;

const headerCell = "border-border text-muted-foreground border-b px-3 py-2 font-medium";
const numberCell = "border-border border-b px-3 py-2 text-right tabular-nums";

/** The skill level columns of one program, which the header spans as a single group. */
function programGroups(columns: readonly SkillColumn[]) {
  const groups: { program: string; span: number }[] = [];

  for (const column of columns) {
    const open = groups.at(-1);
    if (open?.program === column.program) open.span += 1;
    else groups.push({ program: column.program, span: 1 });
  }

  return groups;
}

/**
 * Registrations per class (US-12). Only this table counts the students who answered "no": they
 * are what "angemeldet" and the share are about, and they appear in no other figure, because
 * only a student who is coming can be assigned to an event.
 */
export function ClassOverviewTable({
  rows,
  columns,
}: {
  rows: readonly ClassRow[];
  columns: readonly SkillColumn[];
}) {
  const leading = ["Klasse", "Angemeldet", "Nimmt teil", "Anteil", "Männlich", "Weiblich"];
  const groups = programGroups(columns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr>
            {leading.map((label, index) => (
              <th
                key={label}
                scope="col"
                // The program row above the skill levels is what says which program they count.
                rowSpan={groups.length === 0 ? 1 : 2}
                className={`${headerCell} ${index === 0 ? "text-left" : "text-right"}`}
              >
                {label}
              </th>
            ))}
            {groups.map((group) => (
              <th key={group.program} scope="colgroup" colSpan={group.span} className={headerCell}>
                {group.program}
              </th>
            ))}
          </tr>
          {groups.length > 0 && (
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`${headerCell} text-right`}>
                  {column.skillLevel}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.class}>
              <td className="border-border border-b px-3 py-2 font-medium">{row.class}</td>
              <td className={numberCell}>{row.total}</td>
              <td className={numberCell}>{row.attending}</td>
              <td className={numberCell}>{asPercent(row.attendanceRate)}</td>
              <td className={numberCell}>{row.male}</td>
              <td className={numberCell}>{row.female}</td>
              {columns.map((column) => (
                <td key={column.key} className={numberCell}>
                  {row.skillLevels[column.key] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
