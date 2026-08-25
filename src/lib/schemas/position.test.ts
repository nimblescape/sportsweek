/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { applyVisibleOrder, byPosition, positionSchema } from "./position";

describe("positionSchema", () => {
  it("accepts a whole number", () => {
    expect(positionSchema.parse(3)).toBe(3);
  });

  it("treats a record stored before ordering existed as unplaced", () => {
    expect(positionSchema.parse(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects a fractional position, so ties cannot be introduced by halving", () => {
    expect(positionSchema.safeParse(1.5).success).toBe(false);
  });

  it("rejects a negative position", () => {
    expect(positionSchema.safeParse(-1).success).toBe(false);
  });
});

describe("byPosition", () => {
  it("orders by position, not by name", () => {
    const items = [
      { id: "c", name: "Anton", position: 2 },
      { id: "a", name: "Zoe", position: 0 },
      { id: "b", name: "Mia", position: 1 },
    ];

    expect([...items].sort(byPosition).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("puts unplaced items last, so a list predating ordering still shows every item", () => {
    const items = [
      { id: "old", name: "Anton", position: Number.MAX_SAFE_INTEGER },
      { id: "new", name: "Zoe", position: 0 },
    ];

    expect([...items].sort(byPosition).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("falls back to the name when positions tie, so the order is never arbitrary", () => {
    const items = [
      { id: "b", name: "Zoe", position: 0 },
      { id: "a", name: "Anton", position: 0 },
    ];

    expect([...items].sort(byPosition).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("compares names the German way, so umlauts sort where a reader expects", () => {
    const items = [
      { id: "z", name: "Zell", position: 0 },
      { id: "o", name: "Öhler", position: 0 },
      { id: "a", name: "Anton", position: 0 },
    ];

    expect([...items].sort(byPosition).map((item) => item.id)).toEqual(["a", "o", "z"]);
  });
});

describe("applyVisibleOrder", () => {
  it("returns the new order unchanged when everything is visible", () => {
    expect(applyVisibleOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("leaves a hidden item in its own slot", () => {
    // "hidden" sits second and stays second; the visible pair swaps around it.
    expect(applyVisibleOrder(["a", "hidden", "b"], ["b", "a"])).toEqual(["b", "hidden", "a"]);
  });

  it("keeps several hidden items where they were", () => {
    expect(applyVisibleOrder(["h1", "a", "h2", "b", "c"], ["c", "b", "a"])).toEqual([
      "h1",
      "c",
      "h2",
      "b",
      "a",
    ]);
  });

  it("changes nothing when nothing is visible", () => {
    expect(applyVisibleOrder(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
