/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { studentFilterSchema } from "@/lib/filters/student-filter";
import { REPORT_FIELD_TAGS } from "@/lib/report/report-fields";
import { documentIdSchema, requiredText, snapshotValueSchema } from "./common";

/**
 * A report a teacher kept, shared among all teachers rather than private to whoever saved it
 * (US-13). What it holds is the whole report as it stood — which students are shown and which
 * detail lines they show — in the shape the page works in, so opening one is handing the report
 * back what it gave.
 */
export const savedReportSchema = z.object({
  id: documentIdSchema,
  createdByUserId: documentIdSchema,
  name: requiredText(120),
  filter: studentFilterSchema,
  /**
   * The activated field tags, by key. A key nothing offers any more adds no detail line rather
   * than making the saved report unreadable, so one saved by an older release still opens.
   */
  fields: z.array(snapshotValueSchema).max(REPORT_FIELD_TAGS.length).default([]),
});
export type SavedReport = z.infer<typeof savedReportSchema>;

/** The two selections a saved report is: what the page holds, and what opening one restores. */
export const reportSelectionSchema = savedReportSchema.pick({ filter: true, fields: true });
export type ReportSelection = z.infer<typeof reportSelectionSchema>;

/**
 * What a teacher may send. The author comes from the session, so a request naming one is
 * refused outright rather than quietly ignored.
 */
export const savedReportInputSchema = savedReportSchema
  .omit({ id: true, createdByUserId: true })
  .strict();
export type SavedReportInput = z.infer<typeof savedReportInputSchema>;

/** Renaming is the only edit the tag offers, and it touches nothing else (US-13). */
export const savedReportRenameSchema = savedReportSchema.pick({ name: true }).strict();
