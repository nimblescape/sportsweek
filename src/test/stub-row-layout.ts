/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { vi } from "vitest";

export const ROW_HEIGHT = 40;

function rectOf(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 200,
    width: 200,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Lays list rows out vertically for the duration of a test.
 *
 * jsdom reports a zero rect for every element, which leaves drag-and-drop unable to tell one row
 * from the next — the keyboard sensor then moves an item to the far end instead of one step.
 * The container has to span every row as well, or the parent-element modifier clamps each move
 * away before it happens.
 */
export function stubRowLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const row = this.closest("li");
    if (!row) return rectOf(0, Math.max(this.querySelectorAll("li").length, 1) * ROW_HEIGHT);

    const siblings = row.parentElement ? [...row.parentElement.children] : [];
    return rectOf(Math.max(siblings.indexOf(row), 0) * ROW_HEIGHT, ROW_HEIGHT);
  });
}
