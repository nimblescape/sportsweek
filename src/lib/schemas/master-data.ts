/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { hasUniqueNames, requiredText } from "./common";

/** One entry of a teacher-maintained list (US-5 to US-10). Its name is its identity (US-21). */
export const listItemNameSchema = requiredText(120);

/**
 * How many entries one maintained list may hold. Generous rather than tight: the lists share a
 * document with a size limit of their own (US-21), and a school that needs a hundredth class has
 * a problem no schema should be the first to mention.
 */
export const MAX_LIST_ITEMS = 100;

/**
 * Five of the six lists are exactly this: names in the teacher's order. Uniqueness is decided
 * here rather than through a reservation, because the whole list is present in the write (US-21).
 */
export const namedListSchema = z
  .array(listItemNameSchema)
  .max(MAX_LIST_ITEMS, `Höchstens ${MAX_LIST_ITEMS} Einträge.`)
  .refine(hasUniqueNames, "Jeder Eintrag darf nur einmal vorkommen.");

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

/** The one list whose entries are not bare names, because a program carries its equipment (US-5). */
export const programSchema = z.object({
  name: listItemNameSchema,
  requiredEquipment: requiredEquipmentSchema.default([]),
});
export type Program = z.infer<typeof programSchema>;

export const programListSchema = z
  .array(programSchema)
  .max(MAX_LIST_ITEMS, `Höchstens ${MAX_LIST_ITEMS} Einträge.`)
  .refine(
    (programs) => hasUniqueNames(programs.map((program) => program.name)),
    "Jeder Eintrag darf nur einmal vorkommen.",
  );

/**
 * The five lists a place decides (US-33): what an event series offers by default, and what one
 * of its events may name instead. Shared by `eventSeriesSchema` and `eventSchema` so the two
 * scopes cannot come to disagree about what either one holds.
 */
export const overridableListsSchema = z.object({
  programs: programListSchema.default([]),
  skillLevels: namedListSchema.default([]),
  seasonPassOptions: namedListSchema.default([]),
  busPickupPoints: namedListSchema.default([]),
  foodOptions: namedListSchema.default([]),
});
export type OverridableLists = z.infer<typeof overridableListsSchema>;

/**
 * One event of an event series (US-21, US-33). A record because it may carry its own version of
 * the five lists a place decides (see `overridableListsSchema`); "Klassen" stays series-only,
 * since it describes the school rather than the trip.
 *
 * An empty list here is not "asked of nobody" as it is everywhere else — it is "inherited": this
 * event offers whatever the series offers for that category. Naming an entry is what makes the
 * event stop inheriting, and removing the last one is what makes it start again.
 */
export const eventSchema = z.object({ name: listItemNameSchema }).merge(overridableListsSchema);
export type Event = z.infer<typeof eventSchema>;

export const eventListSchema = z
  .array(eventSchema)
  .max(MAX_LIST_ITEMS, `Höchstens ${MAX_LIST_ITEMS} Einträge.`)
  .refine(
    (events) => hasUniqueNames(events.map((event) => event.name)),
    "Jeder Eintrag darf nur einmal vorkommen.",
  );

/** Always offered to students and not editable by teachers, so it is never a foodOptions row (US-9). */
export const FOOD_OPTION_OTHER = "other";

/** What that sentinel is called in the UI — kept apart so display text never becomes the value. */
export const FOOD_OPTION_OTHER_LABEL = "Sonstiges";
