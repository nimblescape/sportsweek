/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { AttendingCounts } from "@/lib/assignment/statistics";

const cell = "border-border border-b px-3 py-1.5";

/** The one figure a card carries that is not per program (US-12). */
export function GenderTable({ counts }: { counts: AttendingCounts }) {
  return (
    <table className="min-w-max text-sm">
      <thead>
        <tr>
          {["Männlich", "Weiblich"].map((label) => (
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
          <td className={`${cell} text-right tabular-nums`}>{counts.male}</td>
          <td className={`${cell} text-right tabular-nums`}>{counts.female}</td>
        </tr>
      </tbody>
    </table>
  );
}
