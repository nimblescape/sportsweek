/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { StudentMasterDataInput } from "@/lib/schemas/student-master-data";

/**
 * A student holds exactly one record per season, so the id is derived from both rather than
 * generated: document ids are unique by construction, which turns "does one exist yet?" into a
 * single-document read on the client and on the server alike (US-11).
 */
export function recordIdFor(seasonId: string, userId: string): string {
  return `${seasonId}__${userId}`;
}

/** Shown instead of the form; the student cannot register until a teacher activates one (US-4). */
export const NO_ACTIVE_SEASON_HINT = "Es ist noch keine Sportveranstaltung freigeschalten.";

/** What an unsaved registration looks like, before the student has answered anything. */
export const EMPTY_REGISTRATION: StudentMasterDataInput = {
  isAttendingSportsWeek: true,
  class: "",
  program: null,
  skillLevel: null,
  busPickupPoint: null,
  foodOption: null,
  foodOtherText: null,
  seasonPassOption: null,
  dateOfBirth: null,
  gender: null,
  phoneNumber: null,
  emergencyContact: null,
  healthNotes: null,
  hasMedication: null,
  equipmentRentalNeeded: null,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};
