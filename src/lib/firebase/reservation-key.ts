/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * How a name becomes the id of its reservation document. Kept apart from the writer in
 * `unique-name.ts` because that one is `server-only` and bound to `adminDb`, which puts it out
 * of reach of the scripts that write to a project named on the command line — and two spellings
 * of one key would let a script claim a name the app then hands out a second time.
 */

/**
 * Reduces a name to the form used for comparison: trimmed and case-folded, so "Montafon",
 * " montafon " and "MONTAFON" all count as the same name (US-4, US-5 to US-10).
 *
 * Deliberately not accent-folding — "Grün" and "Grun" are different words in German, and
 * treating them as one would reject legitimate names.
 */
export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("de-AT");
}

/**
 * The set a name has to be unique within: "seasons" covers every season, while
 * "events:<seasonId>" keeps events unique only inside their own season.
 */
export function scopeOf(collection: string, parentId?: string): string {
  return parentId === undefined ? collection : `${collection}:${parentId}`;
}

/** A slash would split the value into a subcollection path, so it cannot survive in an id. */
export function reservationKey(scope: string, name: string): string {
  return `${scope}|${normalizeName(name)}`.replaceAll("/", "\u2215");
}
