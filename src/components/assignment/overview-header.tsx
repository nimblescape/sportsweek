/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { SkillColumn } from "@/lib/assignment/statistics";

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

export const headerCell = "border-border text-muted-foreground border-b px-3 py-2 font-medium";
export const numberCell = "border-border border-b px-3 py-2 text-right tabular-nums";

/**
 * Both overview tables carry the same skill level columns (US-12), so they share a header: the
 * program on the upper row, spanning the skill levels it is offered at on the lower one. Without
 * that grouping a row of bare level names says nothing about which program it counts.
 */
export function OverviewHeader({
  leading,
  columns,
}: {
  leading: readonly string[];
  columns: readonly SkillColumn[];
}) {
  const groups = programGroups(columns);

  return (
    <thead>
      <tr>
        {leading.map((label, index) => (
          <th
            key={label}
            scope="col"
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
  );
}
