/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
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
      <div className="relative">
        <Input
          // Not type="search": WebKit draws its own clear button for that, next to ours.
          type="text"
          aria-label={`${label}: Name`}
          placeholder="Name suchen"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="pr-8"
        />
        {value.name !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${label}: Name zurücksetzen`}
            onClick={() => onChange({ ...value, name: "" })}
            className="absolute inset-y-0 right-0.5 my-auto"
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      <div role="group" aria-label={`${label}: Filter`} className="flex flex-wrap gap-1.5">
        <Tag label="Alle" pressed={hasNoTags(value)} onPress={() => onChange(clearTags(value))} />
        {groups.map((group) =>
          group.options.map((option) => (
            <Tag
              key={`${group.category}:${option.value}`}
              // The row carries no headings, so the category is what the tag says it is.
              label={`${group.label}: ${option.label}`}
              text={option.label}
              pressed={value.tags[group.category].includes(option.value)}
              onPress={() => onChange(toggleTag(value, group.category, option.value))}
            />
          )),
        )}
      </div>
    </div>
  );
}
