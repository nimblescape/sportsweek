/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StudentFilter } from "@/lib/filters/student-filter";
import { matchingSavedFilter } from "@/lib/report/saved-filters";
import { savedReportFilterSchema, type SavedReportFilter } from "@/lib/schemas/saved-report-filter";
import { useHoverCapability } from "@/lib/ui/use-hover-capability";

const nameSchema = savedReportFilterSchema.shape.name;

const LIST_LABEL = "Gespeicherte Filter";
const NAME_LABEL = "Name des Filters";

type SavedFilterPickerProps = {
  filters: readonly SavedReportFilter[];
  /** What a save would keep: the report's current tag selection (US-13). */
  current: StudentFilter;
  onApply: (filter: StudentFilter) => void;
  onSave: (name: string, filter: StudentFilter) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

/**
 * The saved filters of US-13: a dropdown of its own rather than a native `<select>`, which
 * could not carry the rename and delete controls each entry needs. They are shared among all
 * teachers, so the list is the same one for everybody and any teacher may edit any entry.
 */
export function SavedFilterPicker({
  filters,
  current,
  onApply,
  onSave,
  onRename,
  onDelete,
}: SavedFilterPickerProps) {
  const [panel, setPanel] = React.useState<"none" | "list" | "save">("none");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const container = React.useRef<HTMLDivElement>(null);

  // Derived, not remembered: the name goes as soon as a tag is changed, because by then the
  // report is no longer showing what was saved.
  const selected = matchingSavedFilter(filters, current);

  const close = React.useCallback(() => {
    setPanel("none");
    setEditing(null);
    setConfirming(null);
  }, []);

  React.useEffect(() => {
    if (panel === "none") return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [panel, close]);

  /**
   * Roving focus over the entries. It is handled on the wrapper rather than on each entry so
   * the first arrow press reaches the list while focus is still on the trigger that opened it.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const options = [
      ...(container.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
    ];
    if (options.length === 0) return;

    event.preventDefault();
    const at = options.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = at === -1 ? 0 : Math.min(Math.max(at + step, 0), options.length - 1);
    options[next].focus();
  }

  return (
    <div ref={container} onKeyDown={onKeyDown} className="relative flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        aria-haspopup="listbox"
        aria-expanded={panel === "list"}
        onClick={() => setPanel(panel === "list" ? "none" : "list")}
      >
        {selected === null ? LIST_LABEL : `${LIST_LABEL}: ${selected.name}`}
        <ChevronDown aria-hidden data-icon="inline-end" />
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => setPanel(panel === "save" ? "none" : "save")}
      >
        Filter speichern
      </Button>

      {panel === "list" ? (
        <div className="bg-popover ring-foreground/10 absolute top-full left-0 z-50 mt-1 w-72 rounded-lg p-1 shadow-md ring-1">
          {filters.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              Noch keine Filter gespeichert.
            </p>
          ) : (
            <ul role="listbox" aria-label={LIST_LABEL} className="flex flex-col">
              {filters.map((filter) => (
                <li key={filter.id} role="none">
                  <FilterRow
                    filter={filter}
                    selected={filter.id === selected?.id}
                    editing={editing === filter.id}
                    confirming={confirming === filter.id}
                    onApply={() => {
                      onApply(filter.filter);
                      close();
                    }}
                    onStartRename={() => {
                      setConfirming(null);
                      setEditing(filter.id);
                    }}
                    onRename={async (name) => {
                      await onRename(filter.id, name);
                      setEditing(null);
                    }}
                    onStartDelete={() => {
                      setEditing(null);
                      setConfirming(filter.id);
                    }}
                    onDelete={async () => {
                      await onDelete(filter.id);
                      setConfirming(null);
                    }}
                    onCancel={() => {
                      setEditing(null);
                      setConfirming(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {panel === "save" ? (
        <div className="bg-popover ring-foreground/10 absolute top-full left-0 z-50 mt-1 w-72 rounded-lg p-2 shadow-md ring-1">
          <NameForm
            submitLabel="Speichern"
            onSubmit={async (name) => {
              await onSave(name, current);
              close();
            }}
            onCancel={close}
          />
        </div>
      ) : null}
    </div>
  );
}

type FilterRowProps = {
  filter: SavedReportFilter;
  selected: boolean;
  editing: boolean;
  confirming: boolean;
  onApply: () => void;
  onStartRename: () => void;
  onRename: (name: string) => Promise<void>;
  onStartDelete: () => void;
  onDelete: () => Promise<void>;
  onCancel: () => void;
};

function FilterRow({
  filter,
  selected,
  editing,
  confirming,
  onApply,
  onStartRename,
  onRename,
  onStartDelete,
  onDelete,
  onCancel,
}: FilterRowProps) {
  const canHover = useHoverCapability();

  // Revealed on hover where there is one; on a touch screen there is none, and a control nobody
  // can reveal is a control nobody has (see General).
  const iconClasses = cn(
    "shrink-0 transition-opacity",
    canHover && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
  );

  if (editing) {
    return (
      <div className="p-1">
        <NameForm
          initialName={filter.name}
          submitLabel="Umbenennen"
          cancelLabel="Umbenennen abbrechen"
          onSubmit={onRename}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className="group hover:bg-muted flex items-center gap-1 rounded-md">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        onClick={onApply}
        className={cn(
          "focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3",
          selected && "font-medium",
        )}
      >
        {filter.name}
      </button>

      {confirming ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Löschen bestätigen"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
          >
            <Check aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Abbrechen" onClick={onCancel}>
            <X aria-hidden />
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Filter ${filter.name} umbenennen`}
            onClick={onStartRename}
            className={iconClasses}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Filter ${filter.name} löschen`}
            onClick={onStartDelete}
            className={cn(
              iconClasses,
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}

type NameFormProps = {
  initialName?: string;
  submitLabel: string;
  cancelLabel?: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

/** The one place a filter's name is typed — saving a new one and renaming an old one (US-13). */
function NameForm({
  initialName = "",
  submitLabel,
  cancelLabel = "Abbrechen",
  onSubmit,
  onCancel,
}: NameFormProps) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The schema owns the wording, so the hint under the field is the one the server would send.
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <Input
        autoFocus
        aria-label={NAME_LABEL}
        placeholder={NAME_LABEL}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" aria-label={cancelLabel} onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
