import { z } from "zod";
import { documentIdSchema, requiredText } from "./common";

/** Every teacher-maintained list (US-5 to US-10) shares this shape. */
const namedListItemSchema = z.object({
  id: documentIdSchema,
  name: requiredText(120),
});
export type NamedListItem = z.infer<typeof namedListItemSchema>;

export const classOptionSchema = namedListItemSchema;
export const skillLevelSchema = namedListItemSchema;
export const busPickupPointSchema = namedListItemSchema;
export const foodOptionSchema = namedListItemSchema;
export const seasonPassOptionSchema = namedListItemSchema;
export const programSchema = namedListItemSchema;

export const requiredEquipmentItemSchema = z.object({
  id: documentIdSchema,
  programId: documentIdSchema,
  name: requiredText(120),
});
export type RequiredEquipmentItem = z.infer<typeof requiredEquipmentItemSchema>;

/** Always offered to students and not editable by teachers, so it is never a foodOptions row (US-9). */
export const FOOD_OPTION_OTHER = "other";
