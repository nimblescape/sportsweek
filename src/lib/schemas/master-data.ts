/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema, hasUniqueNames, requiredText } from "./common";
import { positionSchema } from "./position";

/** Every teacher-maintained list (US-5 to US-10) shares this shape. */
export const namedListItemSchema = z.object({
  id: documentIdSchema,
  name: requiredText(120),
  position: positionSchema,
});
export type NamedListItem = z.infer<typeof namedListItemSchema>;

export const classOptionSchema = namedListItemSchema;
export const skillLevelSchema = namedListItemSchema;
export const busPickupPointSchema = namedListItemSchema;
export const foodOptionSchema = namedListItemSchema;
export const seasonPassOptionSchema = namedListItemSchema;

/**
 * How many entries either equipment list may hold. The school hands out a handful of items per
 * program — skis, boots, poles, a helmet — and a student rents from exactly that list (US-11),
 * so one number bounds both and they cannot drift into contradicting each other.
 */
export const MAX_EQUIPMENT_ITEMS = 10;

/**
 * Required equipment lives on the program rather than in records of its own (US-5): an item has
 * no identity outside the program that requires it, and nothing references one. Holding the list
 * in a single field is also what makes uniqueness checkable without a query — the whole list is
 * right there, and rewriting it is one atomic change.
 */
export const requiredEquipmentSchema = z
  .array(requiredText(120))
  .max(MAX_EQUIPMENT_ITEMS, `Höchstens ${MAX_EQUIPMENT_ITEMS} Einträge.`)
  .refine(hasUniqueNames, "Jeder Ausrüstungsgegenstand darf nur einmal vorkommen.");

export const programSchema = namedListItemSchema.extend({
  requiredEquipment: requiredEquipmentSchema.default([]),
});
export type Program = z.infer<typeof programSchema>;

/** Always offered to students and not editable by teachers, so it is never a foodOptions row (US-9). */
export const FOOD_OPTION_OTHER = "other";

/** What that sentinel is called in the UI — kept apart so display text never becomes the value. */
export const FOOD_OPTION_OTHER_LABEL = "Sonstiges";
