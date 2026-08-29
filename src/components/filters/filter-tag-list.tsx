/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Tag, TagName } from "@/components/ui/tag";
import { FilterNameField } from "@/components/filters/filter-name-field";
import {
  clearTags,
  hasNoTags,
  toggleTag,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";

type FilterTagListProps = {
  /** Prefixes every accessible name: two of these share a page, and each needs its own (US-12). */
  label: string;
  groups: readonly FilterGroup[];
  value: StudentFilter;
  onChange: (next: StudentFilter) => void;
};

/**
 * The shared filter of US-12 and US-13: a name field with a clear button, and one wrapping row
 * holding every category's tags together. The categories arrive as a prop because the report
 * adds attendance to the same row (US-13).
 */
export function FilterTagList({ label, groups, value, onChange }: FilterTagListProps) {
  return (
    <div className="space-y-2">
      <FilterNameField
        label={label}
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
      />

      <div role="group" aria-label={`${label}: Filter`} className="flex flex-wrap gap-1.5">
        <Tag pressed={hasNoTags(value)}>
          <TagName label="Alle" onPress={() => onChange(clearTags(value))} />
        </Tag>
        {groups.map((group) =>
          group.options.map((option) => (
            <Tag
              key={`${group.category}:${option.value}`}
              pressed={value.tags[group.category].includes(option.value)}
            >
              <TagName
                // The row carries no headings, so the category is what the tag says it is.
                label={option.name ?? `${group.label}: ${option.label}`}
                text={option.label}
                onPress={() => onChange(toggleTag(value, group.category, option.value))}
              />
            </Tag>
          )),
        )}
      </div>
    </div>
  );
}
