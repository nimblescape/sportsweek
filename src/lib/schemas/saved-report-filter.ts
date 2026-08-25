import { z } from "zod";
import {
  documentIdSchema,
  genderSchema,
  optionalText,
  requiredText,
  snapshotValueSchema,
} from "./common";

// Shared among all teachers, not private to the one who saved it (US-13).
// A null category imposes no restriction; values within a category combine with OR.
export const savedReportFilterSchema = z.object({
  id: documentIdSchema,
  createdByUserId: documentIdSchema,
  name: requiredText(120),
  classFilter: z.array(snapshotValueSchema).nullable(),
  genderFilter: z.array(genderSchema).nullable(),
  programFilter: z.array(snapshotValueSchema).nullable(),
  skillLevelFilter: z.array(snapshotValueSchema).nullable(),
  attendingFilter: z.array(z.boolean()).nullable(),
  nameTextFilter: optionalText(120),
});
export type SavedReportFilter = z.infer<typeof savedReportFilterSchema>;
