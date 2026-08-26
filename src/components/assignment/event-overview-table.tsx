/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import type { EventRow, SkillColumn } from "@/lib/assignment/statistics";
import { cn } from "@/lib/utils";
import { numberCell, OverviewHeader } from "./overview-header";

type EventOverviewTableProps = {
  rows: readonly EventRow[];
  columns: readonly SkillColumn[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
};

/**
 * The same attending-only figures as the class table, broken down by event, and the place the
 * teacher picks the event the transfer lists below work on (US-12).
 *
 * The pick is a radio group rather than a click handler alone: it is what says that exactly one
 * event is selected, and what makes the choice reachable without a pointer. The row stays
 * clickable because that is the gesture US-12 describes.
 */
export function EventOverviewTable({
  rows,
  columns,
  selectedId,
  onSelect,
}: EventOverviewTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <OverviewHeader leading={["Event", "Männlich", "Weiblich"]} columns={columns} />
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.id)}
              className={cn(
                "hover:bg-muted cursor-pointer",
                row.id === selectedId && "bg-accent hover:bg-accent",
              )}
            >
              <td className="border-border border-b px-3 py-2 font-medium">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="assignment-event"
                    className="accent-primary size-4"
                    checked={row.id === selectedId}
                    onChange={() => onSelect(row.id)}
                  />
                  {row.name}
                </label>
              </td>
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
