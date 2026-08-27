/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * How a name becomes the key it is compared and queried by. Pure and free of `server-only` and
 * `adminDb`, because the scripts that write to a project named on the command line need it too —
 * and two spellings of one key would let a script claim a name the app then hands out again.
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
