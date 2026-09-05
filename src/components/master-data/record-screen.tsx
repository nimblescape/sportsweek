/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { BusyRegion } from "@/components/ui/busy-region";
import { Tag, TagName } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import type { Crumb, RecordTab } from "@/lib/master-data/hierarchy";

/** The row names what the record on screen is made of, whatever level of the hierarchy it is. */
export const RECORD_TABS_LABEL = "Bereiche";

/** Controls where Enter already means something of their own, so the screen leaves it alone. */
const OWNS_ENTER = "input, textarea, select, button, a, [contenteditable='true']";

type RecordScreenProps = {
  /** The ancestors of what is on screen. The marked collection is added as the last step. */
  trail: readonly Crumb[];
  tabs: readonly RecordTab[];
  /** The key of the tab whose entries the list beneath is showing. */
  marked: string;
  /** Held while a write of the screen's is out, so a second press cannot follow the first. */
  busy?: boolean;
  onAdd: () => void;
  /** What the marked collection holds — a list, and whatever the screen puts above it. */
  children: ReactNode;
};

/**
 * The one master-detail editor this application has (US-33). Every level of the hierarchy is this
 * screen: the path down to what is open, whose last step is the heading; a tag per child
 * collection the record has; and the marked collection's entries beneath. A row of one tag at the
 * root and at the equipment leaf is the same screen with fewer tags.
 *
 * The trail ends at the marked collection rather than at the record above it, so it says what the
 * list beneath is and follows the tag that is pressed. The screen appends that step itself, which
 * is what keeps the path and the marked tag from ever disagreeing.
 *
 * The marked tag is already open, so the whole of it adds to the list it is showing; every other
 * tag opens the collection it names. What differs between levels is only the list inside — which
 * is why it comes in as children rather than being a shape this component knows about.
 */
export function RecordScreen({
  trail,
  tabs,
  marked,
  busy = false,
  onAdd,
  children,
}: RecordScreenProps) {
  const router = useRouter();
  const openTab = tabs.find((tab) => tab.key === marked);
  // A row of one tag offers no choice, so naming it in the path would add nothing the row does
  // not already say — the path ends at the record instead. Unless the record has no ancestors,
  // where that one collection is the whole path there is.
  const namesCollection = openTab !== undefined && (tabs.length > 1 || trail.length === 0);
  const path = namesCollection ? [...trail, { label: openTab.label, href: openTab.href }] : trail;

  // Adding to the marked collection is what the screen is for, so Enter does it wherever the
  // teacher happens to be — short of a control or a dialog that already answers Enter itself.
  useEffect(() => {
    if (busy) return;

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
  }, [busy, onAdd]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <BusyRegion busy={busy}>
        <div className="flex flex-col gap-4">
          <Breadcrumb trail={path} />

          <div
            role="group"
            aria-label={RECORD_TABS_LABEL}
            className="flex flex-wrap items-center gap-2"
          >
            {tabs.map((tab) =>
              tab.key === marked ? (
                <Tooltip key={tab.key} label={tab.addLabel}>
                  {/* The tag is the control, so the tooltip hangs on a wrapper it fills. */}
                  <span className="inline-flex">
                    <Tag
                      pressed
                      disabled={busy}
                      label={`${tab.label}: ${tab.addLabel}`}
                      onClick={onAdd}
                    >
                      <span className="max-w-60 truncate px-0.5">{tab.label}</span>
                      <Plus aria-hidden />
                    </Tag>
                  </span>
                </Tooltip>
              ) : (
                <Tag key={tab.key} disabled={busy}>
                  <TagName label={tab.label} onPress={() => router.push(tab.href)} />
                </Tag>
              ),
            )}
          </div>

          {children}
        </div>
      </BusyRegion>
    </div>
  );
}
