/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeading } from "@/components/layout/page-heading";
import { Tag, TagAction, TagName } from "@/components/ui/tag";
import type { Crumb, RecordTab } from "@/lib/master-data/hierarchy";

/** The row names what the record on screen is made of, whatever level of the hierarchy it is. */
export const RECORD_TABS_LABEL = "Bereiche";

type RecordHeaderProps = {
  trail: readonly Crumb[];
  title: string;
  tabs: readonly RecordTab[];
  /** The key of the tab whose entries the list beneath is showing. */
  marked: string;
  /** Held while a write of the screen's is out, so a second press cannot follow the first. */
  disabled?: boolean;
  onAdd: () => void;
};

/**
 * The top of every master data screen (US-33): the path down to the record, the record's own
 * name, and a tag per child collection it has. One shape repeated at each level — a row of one
 * tag at the root and at the equipment leaf is the same row with fewer tags.
 *
 * Only the marked tag carries its add control, so a press cannot land on a collection the list
 * beneath is not showing, and the wording is the collection's own rather than one shared word.
 */
export function RecordHeader({
  trail,
  title,
  tabs,
  marked,
  disabled = false,
  onAdd,
}: RecordHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb trail={trail} />
      <PageHeading>{title}</PageHeading>

      <div
        role="group"
        aria-label={RECORD_TABS_LABEL}
        className="flex flex-wrap items-center gap-2"
      >
        {tabs.map((tab) => {
          const isMarked = tab.key === marked;

          return (
            <Tag key={tab.key} pressed={isMarked} disabled={disabled}>
              {/* Pressing the marked tag adds to the list it is already showing; there is
                  nowhere else for it to go. */}
              <TagName
                label={tab.label}
                onPress={() => (isMarked ? onAdd() : router.push(tab.href))}
              />
              {isMarked ? (
                <TagAction label={tab.addLabel} onClick={onAdd}>
                  <Plus aria-hidden />
                </TagAction>
              ) : null}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
