/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { ChoiceGroup } from "./fields";

type EquipmentChecklistProps = {
  /** The selected program's required equipment, in the order the teacher set (US-5). */
  items: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
};

/**
 * Which of the program's required equipment the student borrows (US-11).
 *
 * "Alle" is a control rather than an item: it is derived from the others and never stored, so
 * checking every box by hand ticks it and unchecking any one drops it, with no state of its own
 * that could disagree with the selection.
 */
export function EquipmentChecklist({ items, value, onChange, error }: EquipmentChecklistProps) {
  const selected = new Set(value);
  const allSelected = items.length > 0 && items.every((item) => selected.has(item));

  function toggle(item: string) {
    const next = selected.has(item)
      ? items.filter((candidate) => candidate !== item && selected.has(candidate))
      : items.filter((candidate) => candidate === item || selected.has(candidate));
    onChange([...next]);
  }

  return (
    <ChoiceGroup label="Welche Ausrüstung brauchst du?" error={error}>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={allSelected}
          onChange={() => onChange(allSelected ? [] : [...items])}
        />
        Alle
      </label>
      {items.map((item) => (
        <label key={item} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={selected.has(item)}
            onChange={() => toggle(item)}
          />
          {item}
        </label>
      ))}
    </ChoiceGroup>
  );
}
