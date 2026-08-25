/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/** Single source of truth for collection names — never build a path from a string literal. */
export const COLLECTIONS = {
  users: "users",
  seasons: "seasons",
  events: "events",
  programs: "programs",
  requiredEquipmentItems: "requiredEquipmentItems",
  classOptions: "classOptions",
  skillLevels: "skillLevels",
  busPickupPoints: "busPickupPoints",
  foodOptions: "foodOptions",
  seasonPassOptions: "seasonPassOptions",
  studentMasterData: "studentMasterData",
  emergencyContacts: "emergencyContacts",
  equipmentRentalItems: "equipmentRentalItems",
  savedReportFilters: "savedReportFilters",
  /** Name reservations: the document id is the name, which is how uniqueness is enforced. */
  reservedNames: "reservedNames",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
