/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { vi } from "vitest";

const CARD_HEIGHT = 100;

/**
 * Stacks the assignment board's cards for the duration of a test.
 *
 * jsdom reports a zero rect for every element, which leaves drag-and-drop unable to tell one
 * card from the next — every drop then lands wherever the collision detection happens to look
 * first. Each element is given the rect of the card it sits in, so a dragged row starts out
 * exactly where its own card is.
 */
export function stubBoardLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const card = this.closest("[data-slot=card][aria-label]");
    const cards = [...document.querySelectorAll("[data-slot=card][aria-label]")];
    const top = Math.max(card ? cards.indexOf(card) : 0, 0) * CARD_HEIGHT;

    return {
      x: 0,
      y: top,
      left: 0,
      right: 200,
      top,
      bottom: top + CARD_HEIGHT,
      width: 200,
      height: CARD_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  });
}
