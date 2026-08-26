/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { vi } from "vitest";

/**
 * Stacks the assignment dialog's two student lists for the duration of a test.
 *
 * jsdom reports a zero rect for every element, which leaves drag-and-drop unable to tell the
 * upper list from the lower one — every drop then lands wherever the collision detection
 * happens to look first.
 */
export function stubTransferLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const label = this.closest("[role=group][aria-label]")?.getAttribute("aria-label") ?? "";
    const top = label.startsWith("Zugeteilt") ? 300 : 0;

    return {
      x: 0,
      y: top,
      left: 0,
      right: 200,
      top,
      bottom: top + 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  });
}
