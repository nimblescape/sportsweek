import type { Season } from "@/lib/schemas/season";

export const SEASON_STATES = ["active", "archived", "inactive"] as const;
export type SeasonState = (typeof SEASON_STATES)[number];

/**
 * Derives the displayed state from the two stored flags (US-4) — it is never persisted.
 * Archived takes precedence, so a contradictory record still resolves to exactly one state.
 */
export function seasonState(season: Pick<Season, "isActive" | "isArchived">): SeasonState {
  if (season.isArchived) return "archived";
  if (season.isActive) return "active";
  return "inactive";
}

export const SEASON_STATE_LABELS: Record<SeasonState, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  inactive: "Inaktiv",
};
