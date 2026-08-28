/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { skillColumnKey } from "@/lib/assignment/statistics";

const cell = "border-border border-b px-3 py-1.5";

/** What the one line left is called once the other dimension has no list to name it by. */
const COUNT_LABEL = "Anzahl";

/**
 * Skill levels down against programs across (US-5, US-7), both in the order they are maintained
 * in. Laid out from the lists rather than from what happens to be counted, so a program or a
 * level a teacher adds appears here without a code change.
 *
 * A list with no entries is a question nobody was asked (US-21). The dimension that is left keeps
 * its own headings and the counts fall on a single "Anzahl" line, rather than the figures going
 * missing along with the question.
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
  const across: (string | null)[] = programs.length > 0 ? [...programs] : [null];
  const down: (string | null)[] = skillLevels.length > 0 ? [...skillLevels] : [null];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {across.map((program) => (
              <th
                key={program ?? COUNT_LABEL}
                scope="col"
                className={`${cell} text-muted-foreground text-right font-medium`}
              >
                {program ?? COUNT_LABEL}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {down.map((skillLevel) => (
            <tr key={skillLevel ?? COUNT_LABEL}>
              <th
                scope="row"
                className={`${cell} text-muted-foreground pl-0 text-left font-medium`}
              >
                {skillLevel ?? COUNT_LABEL}
              </th>
              {across.map((program) => (
                <td key={program ?? COUNT_LABEL} className={`${cell} text-right tabular-nums`}>
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
