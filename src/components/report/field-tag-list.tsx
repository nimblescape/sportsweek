/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { REPORT_FIELD_TAGS } from "@/lib/report/report-fields";
import { Tag } from "@/components/ui/tag";

type FieldTagListProps = {
  value: readonly string[];
  onChange: (next: string[]) => void;
};

/**
 * The second, independent tag row of US-13: it decides which detail lines hang off a master
 * line, and never which students are listed. A tag standing for a group activates every field
 * in it at once.
 */
export function FieldTagList({ value, onChange }: FieldTagListProps) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((entry) => entry !== key) : [...value, key]);

  return (
    <div role="group" aria-label="Datenfelder" className="flex flex-wrap gap-1.5">
      {/* What the filter row's "Alle" is to students, this is to detail lines: the report as it
          stands with nothing added. */}
      <Tag label="Keine" pressed={value.length === 0} onPress={() => onChange([])} />
      {REPORT_FIELD_TAGS.map((tag) => (
        <Tag
          key={tag.key}
          // The row carries no heading, so each tag says which of the two rows it belongs to.
          label={`Feld: ${tag.label}`}
          text={tag.label}
          pressed={value.includes(tag.key)}
          onPress={() => toggle(tag.key)}
        />
      ))}
    </div>
  );
}
