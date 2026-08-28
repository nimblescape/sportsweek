/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Button } from "@/components/ui/button";

type TagProps = {
  /** The accessible name, which says which row the tag belongs to; the row carries no heading. */
  label: string;
  text?: string;
  pressed: boolean;
  onPress: () => void;
};

/**
 * An icon control living inside a filled tag. The tag owns the surface, so the control takes
 * none of its own — a second fill inside the first would read as a tag within a tag.
 */
export const TAG_ICON_CLASSES = "hover:bg-transparent hover:text-inherit hover:opacity-70";

/** One tag of a wrapping tag row — the report has two of them, and they look alike (US-13). */
export function Tag({ label, text = label, pressed, onPress }: TagProps) {
  return (
    <Button
      type="button"
      variant={pressed ? "default" : "outline"}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {text}
    </Button>
  );
}
