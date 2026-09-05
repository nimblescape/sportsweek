/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { Card } from "@/components/ui/card";
import type { ReportSection } from "@/lib/master-data/report-tree";

/** What the button that shows it is called, and what the report itself is headed. */
export const MASTER_DATA_REPORT_LABEL = "Stammdatenbericht";

/** Said where the record on screen holds nothing to report on yet. */
export const EMPTY_REPORT = "Es gibt noch keine Stammdaten.";

/**
 * The master data of whatever record is open, expanded downwards (US-33). Read-only and on the
 * page rather than a download: it answers "what does this look like as a whole", which is a
 * question a teacher asks while editing rather than one they take away.
 */
export function MasterDataReport({ sections }: { sections: readonly ReportSection[] }) {
  if (sections.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">{EMPTY_REPORT}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-6 px-(--card-spacing)">
        {sections.map((section) => (
          <Section key={section.title} section={section} depth={0} />
        ))}
      </div>
    </Card>
  );
}

/** The page's heading is the breadcrumb's last step, so the report's own start one level under it. */
const HEADINGS = ["h2", "h3", "h4", "h5", "h6"] as const;

const HEADING_CLASSES = [
  "font-heading text-base font-semibold",
  "font-heading text-sm font-semibold",
  "text-sm font-semibold",
  "text-sm font-medium",
  "text-muted-foreground text-sm font-medium",
] as const;

function Section({ section, depth }: { section: ReportSection; depth: number }) {
  const level = Math.min(depth, HEADINGS.length - 1);
  const Heading = HEADINGS[level];

  return (
    <section className="flex flex-col gap-2">
      <Heading className={HEADING_CLASSES[level]}>{section.title}</Heading>

      {/* What a level holds hangs under a rail from its heading: the nesting reaches assistive
          technology as heading levels, and this is the same nesting made visible. */}
      <div className="border-muted-foreground/30 ml-1.5 flex flex-col gap-2 border-l pl-4">
        {section.entries.length === 0 ? null : (
          // Not a flex column: a flex item is a block, and a list marker is only drawn for a
          // list item.
          <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
            {section.entries.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        )}

        {section.sections.map((child) => (
          <Section key={child.title} section={child} depth={depth + 1} />
        ))}
      </div>
    </section>
  );
}
