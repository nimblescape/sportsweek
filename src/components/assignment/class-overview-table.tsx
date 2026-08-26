/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ClassRow, SkillColumn } from "@/lib/assignment/statistics";
import { numberCell, OverviewHeader } from "./overview-header";

/** Whole per cent: the figure answers "roughly how many of them are coming", not to a decimal. */
const asPercent = (share: number) => `${Math.round(share * 100)} %`;

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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <OverviewHeader
          leading={["Klasse", "Angemeldet", "Nimmt teil", "Anteil", "Männlich", "Weiblich"]}
          columns={columns}
        />
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
