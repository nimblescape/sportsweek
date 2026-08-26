/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Season } from "@/lib/schemas/season";

export const SEASON_STATES = ["active", "archived", "inactive"] as const;
export type SeasonState = (typeof SEASON_STATES)[number];

/** Shown by the views that bind to the active season, and returned by the handlers behind them. */
export const NO_ACTIVE_SEASON_HINT = "Es ist keine Saison aktiv.";

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

/** Archived seasons are hidden by default; the list offers a toggle to bring them back (US-4). */
export function visibleSeasons<T extends Pick<Season, "isArchived">>(
  seasons: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? seasons : seasons.filter((season) => !season.isArchived);
}

/**
 * A master data record carries no archived flag of its own — its state is derived from the
 * season it belongs to (US-4, US-11), so archiving a season locks its records in one write.
 */
export function isRecordArchived(
  record: { seasonId: string },
  seasons: Pick<Season, "id" | "isArchived">[],
): boolean {
  const season = seasons.find((candidate) => candidate.id === record.seasonId);
  return season?.isArchived ?? false;
}

/**
 * Student master data, the assignment dialog and the report all bind to the active season.
 * Having none is a legitimate state a teacher creates by deactivating (US-4) — callers then
 * lock their view instead — whereas an ambiguous result is a data defect and must surface loudly.
 */
export function activeSeasonOf<T extends Pick<Season, "isActive">>(seasons: T[]): T | null {
  const active = seasons.filter((season) => season.isActive);

  if (active.length > 1) {
    throw new Error(`Es sind ${active.length} Saisonen aktiv, es darf aber nur eine geben.`);
  }

  return active[0] ?? null;
}
