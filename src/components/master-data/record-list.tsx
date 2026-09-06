/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Lock, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Whether one of a row's own controls is offered: `true` outright, a sentence where it is refused
 * and that is the reason, `false` where the row does not carry it at all — an archived event
 * series can be restored or removed, but its name is no longer up for change (US-19).
 */
export type RowControl = boolean | string;

/** One row of a master-detail list. Its name is its identity, so it carries no id of its own. */
export type RecordRow = {
  id: string;
  name: string;
  /** Where the row's own record page is; absent where the entry has nothing beneath it (US-33). */
  href?: string;
  /** What the row says about itself beside its name, such as whether a series is open (US-19). */
  badge?: ReactNode;
  /** Controls ahead of edit and delete — archiving an event series, and nothing else so far. */
  actions?: ReactNode;
  edit: RowControl;
  remove: RowControl;
};

type RecordListProps = {
  /** What one entry is called, which is how its controls are named to assistive technology. */
  singular: string;
  rows: readonly RecordRow[];
  loading: boolean;
  error: string | null;
  /** What the error says the list is, in the plural. */
  title: string;
  empty: string;
  /** Options offered to students that the teacher does not maintain, such as "Sonstiges" (US-9). */
  fixedItems?: readonly string[];
  fixedItemsHint?: string;
  /** The row a write is running on; every control of that row is held until it is answered. */
  busyId?: string | null;
  onEdit: (row: RecordRow) => void;
  onDelete: (row: RecordRow) => void;
  /** Receives the ids in their new order after a drag (see Ordering). */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
};

const refusal = (control: RowControl) => (typeof control === "string" ? control : null);

/**
 * The one list every master-detail editor shows (US-33): a grip to reorder by, a name that opens
 * the row's own record where it has one, and the row's controls at the far end. What differs
 * between levels arrives per row rather than as a second component — an event series is this list
 * with a state to show and archiving to offer.
 */
export function RecordList({
  singular,
  rows,
  loading,
  error,
  title,
  empty,
  fixedItems = [],
  fixedItemsHint,
  busyId = null,
  onEdit,
  onDelete,
  onReorder,
}: RecordListProps) {
  // The header spinner says the app is working; a second one on the list would say it twice.
  if (loading) return null;

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          {title} konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (rows.length === 0 && fixedItems.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">{empty}</p>
      </Card>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <SortableList
        items={[...rows]}
        onReorder={onReorder}
        busyId={busyId}
        renderItem={(row) => {
          const busy = row.id === busyId;
          const editHint = refusal(row.edit);
          const deleteHint = refusal(row.remove);
          const hintId = `${row.id}-row-hint`;

          return (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 pr-4 pl-2">
              {row.href === undefined ? (
                <span className="truncate px-2 text-sm font-medium">{row.name}</span>
              ) : (
                // A row with a record page of its own is opened by what it is called (US-33).
                <Link
                  href={row.href}
                  // A link has no disabled state of its own, so a write running on this row has
                  // to be spelled out for the pointer, the keyboard and assistive technology.
                  aria-disabled={busy || undefined}
                  tabIndex={busy ? -1 : undefined}
                  onClick={busy ? (clicked) => clicked.preventDefault() : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "max-w-full min-w-0 justify-start",
                    busy && "pointer-events-none opacity-50",
                  )}
                >
                  <span className="truncate">{row.name}</span>
                  <ChevronRight aria-hidden data-icon="inline-end" />
                </Link>
              )}

              <div className="flex shrink-0 items-center gap-4">
                {row.badge}

                <div className="flex shrink-0 items-center gap-1">
                  {row.actions}

                  {/* Wrapped in a span because a disabled button emits no pointer events, and the
                      reason it is disabled is exactly what needs explaining here. */}
                  {row.edit === false ? null : (
                    <Tooltip label={editHint ?? "Bearbeiten"}>
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={editHint !== null || busy}
                          aria-label={`${singular} ${row.name} bearbeiten`}
                          aria-describedby={editHint === null ? undefined : hintId}
                          onClick={() => onEdit(row)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                      </span>
                    </Tooltip>
                  )}

                  {row.remove === false ? null : (
                    <Tooltip label={deleteHint ?? "Löschen"}>
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteHint !== null || busy}
                          aria-label={`${singular} ${row.name} löschen`}
                          aria-describedby={deleteHint === null ? undefined : hintId}
                          onClick={() => onDelete(row)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    </Tooltip>
                  )}

                  {(editHint ?? deleteHint) ? (
                    <span id={hintId} className="sr-only">
                      {editHint ?? deleteHint}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }}
        className="[&>li]:border-border [&>li]:border-b [&>li:last-child]:border-b-0"
      />

      <ul className="border-border [&>li]:border-border empty:hidden [&>li]:border-t">
        {/* Always offered to students and never a row of its own, so it carries no controls (US-9). */}
        {fixedItems.map((name) => {
          const hint = fixedItemsHint ?? "Diese Option ist fix und kann nicht geändert werden.";

          return (
            <li
              key={name}
              className="text-muted-foreground flex items-center justify-between gap-4 py-3 pr-4 pl-9"
            >
              <span className="text-sm font-medium">{name}</span>
              <Tooltip label={hint}>
                <span className="inline-flex p-1.5">
                  <Lock aria-hidden className="size-4" />
                  <span className="sr-only">{hint}</span>
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
