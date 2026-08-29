/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema, requiredText } from "./common";
import { namedListSchema, programListSchema } from "./master-data";
import { positionSchema } from "./position";

// What the list shows about a series is derived from these flags, never stored.
export const eventSeriesSchema = z.object({
  id: documentIdSchema,
  name: requiredText(120),
  /**
   * The normalised name, derived by the server and never sent by a client. Uniqueness is an
   * equality query on this inside the write's transaction: an equality on `name` would compare
   * exact strings and lose the case- and whitespace-insensitivity the rule asks for (US-4).
   */
  nameKey: z.string().min(1),
  isArchived: z.boolean(),
  /**
   * Whether students may write to this series — join it, and go on amending what they said
   * (US-19). Not the old active flag: any number of series may be open at once, and this governs
   * students only, since a teacher works in a series whether it is open or not. An invitation link
   * sets it, archiving clears it, and unarchiving deliberately does not restore it.
   */
  isOpenToStudents: z.boolean().default(false),
  // Denormalized from registration so clients — who cannot read that collection directly
  // (see firestore.rules) — can tell whether archiving/deleting is allowed without a round trip.
  hasRegistrations: z.boolean(),
  position: positionSchema,

  /**
   * The teacher-maintained lists. They are fields of this document rather than collections of
   * their own, so that a Kulturwoche is not made to share its lists with a Wintersportwoche
   * (US-21). Array order is the teacher's order, so no item carries a position, and a name is an
   * identity, so no item carries an id.
   *
   * The events lead, because they are the series itself divided into weeks and are maintained on
   * a page of their own (US-4); the rest follow in the order the master data menu states (US-14).
   *
   * Each defaults to empty, which is what a series created before the field existed looks like —
   * and an empty list is a question the student is never asked (US-21).
   */
  events: namedListSchema.default([]),
  classOptions: namedListSchema.default([]),
  programs: programListSchema.default([]),
  skillLevels: namedListSchema.default([]),
  seasonPassOptions: namedListSchema.default([]),
  busPickupPoints: namedListSchema.default([]),
  foodOptions: namedListSchema.default([]),
});
export type EventSeries = z.infer<typeof eventSeriesSchema>;
