/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/** The one clock these records are read against: the school's own, wherever the server runs. */
export const SCHOOL_TIME_ZONE = "Europe/Vienna";

/** Where a login document keeps the value below; a query names it as a path, not as a key. */
export const LOGIN_TIME_FIELD = "at";

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23 rather than hour12: false, which spells the first hour of a day 24 in some locales.
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

/**
 * An instant as the school reads it, ISO 8601 with the offset it was in at the time.
 *
 * A string rather than a Firestore Timestamp, which is an instant and carries no zone: writing
 * a shifted one would make the console show a reading that is wrong in the other direction.
 * The offset is part of the value, so the instant is still recoverable from it.
 */
export function localTimestamp(at: Date): string {
  const parts = Object.fromEntries(FORMAT.formatToParts(at).map((part) => [part.type, part.value]));

  // "GMT+02:00" while the offset is not zero, and a bare "GMT" when it is.
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/**
 * How the school reads a stored sign-in, for a person rather than for the record it lives in.
 * The weekday leads because "was that a school day?" is most of what a login is read for; every
 * part is a fixed width, so several of them line up as a column.
 */
const WHEN = new Intl.DateTimeFormat("de-AT", {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatLoginTime(at: string): string {
  return WHEN.format(new Date(at));
}
