/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema, requiredText } from "./common";

// The displayed state (active / archived / inactive) is derived from these two flags, never stored.
export const seasonSchema = z.object({
  id: documentIdSchema,
  name: requiredText(120),
  isActive: z.boolean(),
  isArchived: z.boolean(),
  // Denormalized from studentMasterData so clients — who cannot read that collection directly
  // (see firestore.rules) — can tell whether archiving/deleting is allowed without a round trip.
  hasStudentData: z.boolean(),
});
export type Season = z.infer<typeof seasonSchema>;

export const eventSchema = z.object({
  id: documentIdSchema,
  seasonId: documentIdSchema,
  name: requiredText(120),
});
export type Event = z.infer<typeof eventSchema>;
