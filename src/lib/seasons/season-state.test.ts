/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  activeSeasonOf,
  isRecordArchived,
  SEASON_STATE_LABELS,
  seasonState,
  visibleSeasons,
} from "@/lib/seasons/season-state";

describe("seasonState", () => {
  it("reports an active season", () => {
    expect(seasonState({ isActive: true, isArchived: false })).toBe("active");
  });

  it("reports an archived season", () => {
    expect(seasonState({ isActive: false, isArchived: true })).toBe("archived");
  });

  it("reports a season that is neither active nor archived as inactive", () => {
    expect(seasonState({ isActive: false, isArchived: false })).toBe("inactive");
  });

  it("lets archived win, so a contradictory record still resolves to one state", () => {
    expect(seasonState({ isActive: true, isArchived: true })).toBe("archived");
  });
});

describe("SEASON_STATE_LABELS", () => {
  it("labels every state in German", () => {
    expect(SEASON_STATE_LABELS).toEqual({
      active: "Aktiv",
      archived: "Archiviert",
      inactive: "Inaktiv",
    });
  });
});

const season = (
  id: string,
  overrides: Partial<{ isActive: boolean; isArchived: boolean }> = {},
) => ({
  id,
  name: `Saison ${id}`,
  isActive: false,
  isArchived: false,
  ...overrides,
});

describe("visibleSeasons", () => {
  it("hides archived seasons from the default list", () => {
    const list = [season("a"), season("b", { isArchived: true })];

    expect(visibleSeasons(list, false).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("brings archived seasons back, so unarchiving stays reachable", () => {
    const list = [season("a"), season("b", { isArchived: true })];

    expect(visibleSeasons(list, true).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps the active season visible", () => {
    const list = [season("a", { isActive: true })];

    expect(visibleSeasons(list, false)).toHaveLength(1);
  });
});

describe("isRecordArchived", () => {
  it("reports a record of an archived season as archived", () => {
    const seasons = [season("s1", { isArchived: true })];

    expect(isRecordArchived({ seasonId: "s1" }, seasons)).toBe(true);
  });

  it("reports a record of a live season as not archived", () => {
    const seasons = [season("s1")];

    expect(isRecordArchived({ seasonId: "s1" }, seasons)).toBe(false);
  });

  it("treats a record whose season is unknown as not archived", () => {
    expect(isRecordArchived({ seasonId: "ghost" }, [season("s1", { isArchived: true })])).toBe(
      false,
    );
  });
});

describe("activeSeasonOf", () => {
  it("returns the single active season", () => {
    const list = [season("a"), season("b", { isActive: true })];

    expect(activeSeasonOf(list).id).toBe("b");
  });

  it("fails loudly when no season is active, instead of silently returning nothing", () => {
    expect(() => activeSeasonOf([season("a")])).toThrow(/keine Saison/i);
  });

  it("fails loudly when more than one season is active", () => {
    const list = [season("a", { isActive: true }), season("b", { isActive: true })];

    expect(() => activeSeasonOf(list)).toThrow(/nur eine/i);
  });
});
