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
  /**
   * The invitation links (US-23). A token is a secret, and a rule grants a whole document — so a
   * token kept as a field of the event series would be readable by everyone that document is.
   * It lives here instead, where no client may read anything, and is resolved server-side.
   */
  invitations: "invitations",
  /**
   * The saved reports (US-13, US-25), beneath the series whose lists they filter on. Beneath
   * rather than in its document for the reason above: a rule grants a whole document, and any
   * signed-in user may read an event series — so a field would hand every student every
   * teacher's reports. Firestore deletes no subcollection with its parent, so removing a series
   * has to name these as well.
   */
  savedReports: "savedReports",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
