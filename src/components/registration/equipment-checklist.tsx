/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { cn } from "@/lib/utils";

type EquipmentChecklistProps = {
  /** The selected program's required equipment, in the order the teacher set (US-5). */
  items: readonly string[];
  /** Ticking only becomes possible once the student says they need to borrow something. */
  selectable: boolean;
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
};

/**
 * The program's required equipment, and which of it the student borrows (US-11).
 *
 * One list serves both: it is what the student has to bring either way, so answering the rental
 * question turns the same rows into choices instead of repeating the list underneath. The boxes
 * are always laid out and only hidden while the answer is "no", so the entries do not shift
 * sideways when it changes. Unticked entries stay muted, so what is being borrowed reads down
 * the column at a glance.
 *
 * "Alle" is a control rather than an item — derived from the others and never stored, so
 * ticking every box by hand ticks it and unticking any one drops it, with no state of its own
 * that could disagree with the selection.
 */
export function EquipmentChecklist({
  items,
  selectable,
  value,
  onChange,
  error,
}: EquipmentChecklistProps) {
  const selected = new Set(value);
  const allSelected = items.length > 0 && items.every((item) => selected.has(item));

  function toggle(item: string) {
    const next = selected.has(item)
      ? items.filter((candidate) => candidate !== item && selected.has(candidate))
      : items.filter((candidate) => candidate === item || selected.has(candidate));
    onChange([...next]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <Row
            key={item}
            label={item}
            selectable={selectable}
            checked={selected.has(item)}
            onToggle={() => toggle(item)}
          />
        ))}
        {selectable ? (
          <Row
            label="Alles"
            selectable
            checked={allSelected}
            onToggle={() => onChange(allSelected ? [] : [...items])}
          />
        ) : null}
      </ul>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

type RowProps = {
  label: string;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
};

function Row({ label, selectable, checked, onToggle }: RowProps) {
  const ticked = selectable && checked;

  return (
    <li>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={cn("accent-primary size-4", !selectable && "invisible")}
          checked={ticked}
          disabled={!selectable}
          onChange={onToggle}
        />
        <span className={cn(!ticked && "text-muted-foreground")}>{label}</span>
      </label>
    </li>
  );
}
