/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { vi } from "vitest";

export const TAG_WIDTH = 120;

function rectOf(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    top: 0,
    bottom: 32,
    left,
    right: left + width,
    width,
    height: 32,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Lays a wrapping tag row out left to right for the duration of a test.
 *
 * jsdom reports a zero rect for every element, which leaves drag-and-drop unable to tell one tag
 * from the next — the keyboard sensor then moves a tag to the far end instead of one step. The
 * row itself has to span every tag as well, or the parent-element modifier clamps each move away
 * before it happens.
 */
export function stubTagRowLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const row = this.closest('[role="group"]');
    if (!row) return rectOf(0, TAG_WIDTH);
    if (this === row) return rectOf(0, Math.max(row.children.length, 1) * TAG_WIDTH);

    // A node contains itself, so this finds the tag whichever depth the measured element sits at.
    const index = [...row.children].findIndex((tag) => tag.contains(this));

    return rectOf(Math.max(index, 0) * TAG_WIDTH, TAG_WIDTH);
  });
}
