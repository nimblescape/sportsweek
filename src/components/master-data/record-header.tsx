/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Tag, TagName } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import type { Crumb, RecordTab } from "@/lib/master-data/hierarchy";

/** The row names what the record on screen is made of, whatever level of the hierarchy it is. */
export const RECORD_TABS_LABEL = "Bereiche";

/** Controls where Enter already means something of their own, so the screen leaves it alone. */
const OWNS_ENTER = "input, textarea, select, button, a, [contenteditable='true']";

type RecordHeaderProps = {
  trail: readonly Crumb[];
  tabs: readonly RecordTab[];
  /** The key of the tab whose entries the list beneath is showing. */
  marked: string;
  /** Held while a write of the screen's is out, so a second press cannot follow the first. */
  disabled?: boolean;
  onAdd: () => void;
};

/**
 * The top of every master data screen (US-33): the path down to the record, whose last step is
 * the heading, and a tag per child collection the record has. One shape repeated at each level —
 * a row of one tag at the root and at the equipment leaf is the same row with fewer tags.
 *
 * The marked tag is already open, so the whole of it adds to the list it is showing; every other
 * tag opens the collection it names.
 */
export function RecordHeader({ trail, tabs, marked, disabled = false, onAdd }: RecordHeaderProps) {
  const router = useRouter();

  // Adding to the marked collection is what the screen is for, so Enter does it wherever the
  // teacher happens to be — short of a control or a dialog that already answers Enter itself.
  useEffect(() => {
    if (disabled) return;

    function addOnEnter(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector("dialog[open]")) return;
      if ((event.target as HTMLElement | null)?.closest(OWNS_ENTER)) return;

      event.preventDefault();
      onAdd();
    }

    window.addEventListener("keydown", addOnEnter);
    return () => window.removeEventListener("keydown", addOnEnter);
  }, [disabled, onAdd]);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb trail={trail} />

      <div
        role="group"
        aria-label={RECORD_TABS_LABEL}
        className="flex flex-wrap items-center gap-2"
      >
        {tabs.map((tab) =>
          tab.key === marked ? (
            <Tooltip key={tab.key} label={tab.addLabel}>
              {/* The tag is the control, so the tooltip hangs on a wrapper the whole pill fills. */}
              <span className="inline-flex">
                <Tag
                  pressed
                  disabled={disabled}
                  label={`${tab.label}: ${tab.addLabel}`}
                  onClick={onAdd}
                >
                  <span className="max-w-60 truncate px-0.5">{tab.label}</span>
                  <Plus aria-hidden />
                </Tag>
              </span>
            </Tooltip>
          ) : (
            <Tag key={tab.key} disabled={disabled}>
              <TagName label={tab.label} onPress={() => router.push(tab.href)} />
            </Tag>
          ),
        )}
      </div>
    </div>
  );
}
