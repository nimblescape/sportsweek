/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { CardHeading } from "@/components/ui/card";
import { Tag, TagName } from "@/components/ui/tag";

/**
 * Each area gets a surface of its own, so three columns of content read as three areas rather
 * than as one crowded block. Side by side from the small breakpoint up — the card is what the
 * teacher works across, so keeping it one column any longer than necessary costs more than the
 * width it saves.
 *
 * The figures track is a plain `auto`: `minmax(0,auto)` reads as the same thing and Chrome
 * treats it as one, but Safari laid the areas out in a single column with it.
 */
export const AREAS = "grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]";
export const AREA = "border-border bg-muted/40 flex min-h-0 min-w-0 flex-col rounded-lg border p-3";

/** The aside sits at the far end of the title line — a tally on one area, a toggle on another. */
export function AreaTitle({ children, aside }: { children: string; aside?: ReactNode }) {
  return (
    <CardHeading control={aside} className="mb-2">
      <h3 className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
        {children}
      </h3>
    </CardHeading>
  );
}

const FILTERED_LABEL = "Gefiltert";

/**
 * Whether the card's figures count everyone it holds or only what its filter leaves. A tag
 * rather than a checkbox, because pressing tags is how everything else on this page is chosen.
 */
export function FilteredTag({
  card,
  pressed,
  onPress,
}: {
  /** Every card offers this one, so the name says which card's it is. */
  card: string;
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    <Tag pressed={pressed}>
      <TagName label={`${card}: ${FILTERED_LABEL}`} text={FILTERED_LABEL} onPress={onPress} />
    </Tag>
  );
}
