/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { asPercent, type AttendingCounts } from "@/lib/assignment/statistics";

const cell = "border-border border-b px-3 py-1.5";

/**
 * The figures a card carries that are not per program (US-12). "Teilnahme" is the counted
 * students over everyone registered, so on the unassigned card — before anything has been
 * assigned — it is the event series' own participation rate, and it falls as students are placed
 * into weeks; on a class card the denominator is that class's own registrations.
 */
export function GenderTable({
  counts,
  registeredTotal,
}: {
  counts: AttendingCounts;
  registeredTotal: number;
}) {
  const total = counts.male + counts.female;
  const columns = [
    ["Männlich", counts.male],
    ["Weiblich", counts.female],
    ["Gesamt", total],
    ["Teilnahme", asPercent(registeredTotal === 0 ? 0 : total / registeredTotal)],
  ] as const;

  return (
    // The scroll box is what stops the table reaching the card: a scroll container contributes
    // nothing to its ancestors' min-content, and a table too narrow to fit does. SkillMatrix
    // carries one for the same reason.
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th
                key={label}
                scope="col"
                className={`${cell} text-muted-foreground text-right font-medium`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map(([label, value]) => (
              <td key={label} className={`${cell} text-right tabular-nums`}>
                {value}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
