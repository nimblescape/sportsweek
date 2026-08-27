/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { skillColumnKey } from "@/lib/assignment/statistics";

const cell = "border-border border-b px-3 py-1.5";

/**
 * Skill levels down against programs across (US-5, US-7), both in the order they are maintained
 * in. Laid out from the lists rather than from what happens to be counted, so a program or a
 * level a teacher adds appears here without a code change.
 */
export function SkillMatrix({
  counts,
  programs,
  skillLevels,
}: {
  counts: Readonly<Record<string, number>>;
  programs: readonly string[];
  skillLevels: readonly string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {programs.map((program) => (
              <th
                key={program}
                scope="col"
                className={`${cell} text-muted-foreground text-right font-medium`}
              >
                {program}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skillLevels.map((skillLevel) => (
            <tr key={skillLevel}>
              <th
                scope="row"
                className={`${cell} text-muted-foreground pl-0 text-left font-medium`}
              >
                {skillLevel}
              </th>
              {programs.map((program) => (
                <td key={program} className={`${cell} text-right tabular-nums`}>
                  {counts[skillColumnKey(program, skillLevel)] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
