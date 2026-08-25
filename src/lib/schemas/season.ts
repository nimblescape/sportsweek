import { z } from "zod";
import { documentIdSchema, requiredText } from "./common";

// The displayed state (active / archived / inactive) is derived from these two flags, never stored.
export const seasonSchema = z.object({
  id: documentIdSchema,
  name: requiredText(120),
  isActive: z.boolean(),
  isArchived: z.boolean(),
});
export type Season = z.infer<typeof seasonSchema>;

export const eventSchema = z.object({
  id: documentIdSchema,
  seasonId: documentIdSchema,
  name: requiredText(120),
});
export type Event = z.infer<typeof eventSchema>;
