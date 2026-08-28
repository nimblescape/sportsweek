/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Single source of truth for collection names — never build a path from a string literal.
 * firestore.rules spells the readable ones out a second time, because a rules file cannot
 * import this one; a name added or renamed here has to be carried over there by hand.
 */
export const COLLECTIONS = {
  users: "users",
  /**
   * Carries the seven teacher-maintained lists — its events among them — in its own document
   * rather than in collections of their own, so that each series' lists are its own (US-21).
   */
  eventSeries: "eventSeries",
  // The emergency contact and the rented equipment are fields of this record rather than
  // collections of their own: neither exists apart from it, and nothing else refers to them.
  registrations: "registrations",
  savedReports: "savedReports",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
