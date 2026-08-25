import { describe, expect, it } from "vitest";
import { SEASON_STATE_LABELS, seasonState } from "@/lib/seasons/season-state";

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
