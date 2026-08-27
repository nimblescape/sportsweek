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
  eventSeries: "eventSeries",
  events: "events",
  programs: "programs",
  classOptions: "classOptions",
  skillLevels: "skillLevels",
  busPickupPoints: "busPickupPoints",
  foodOptions: "foodOptions",
  seasonPassOptions: "seasonPassOptions",
  // The emergency contact and the rented equipment are fields of this record rather than
  // collections of their own: neither exists apart from it, and nothing else refers to them.
  registrations: "registrations",
  savedReports: "savedReports",
  /** Name reservations: the document id is the name, which is how uniqueness is enforced. */
  reservedNames: "reservedNames",
  /** Which defaults have already been seeded, so a deleted one is never resurrected. */
  seedState: "seedState",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
