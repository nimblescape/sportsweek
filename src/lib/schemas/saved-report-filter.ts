/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { studentFilterSchema } from "@/lib/filters/student-filter";
import { documentIdSchema, requiredText } from "./common";

/**
 * A filter tag list selection a teacher kept, shared among all teachers rather than private to
 * whoever saved it (US-13). What it holds is the selection itself, in the shape the report
 * filters with, so applying one is handing the report back what it gave.
 */
export const savedReportFilterSchema = z.object({
  id: documentIdSchema,
  createdByUserId: documentIdSchema,
  name: requiredText(120),
  filter: studentFilterSchema,
});
export type SavedReportFilter = z.infer<typeof savedReportFilterSchema>;

/**
 * What a teacher may send. The author comes from the session, so a request naming one is
 * refused outright rather than quietly ignored.
 */
export const savedReportFilterInputSchema = savedReportFilterSchema
  .omit({ id: true, createdByUserId: true })
  .strict();
export type SavedReportFilterInput = z.infer<typeof savedReportFilterInputSchema>;

/** Renaming is the only edit the dropdown offers, and it touches nothing else (US-13). */
export const savedReportFilterRenameSchema = savedReportFilterSchema.pick({ name: true }).strict();
