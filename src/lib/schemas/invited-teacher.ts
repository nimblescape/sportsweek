/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { permissionsSchema } from "@/lib/auth/permissions";
import { requiredText, documentIdSchema } from "./common";
import { listItemNameSchema } from "./master-data";

/**
 * A class in one event series, waiting for a colleague who has not yet signed in (US-40). The
 * same class name means a different class in a different series, so both are named.
 */
export const classAssignmentSchema = z.object({
  eventSeriesId: documentIdSchema,
  class: listItemNameSchema,
});
export type ClassAssignment = z.infer<typeof classAssignmentSchema>;

/** As `invitedTeachers/{email}` holds it before anybody has claimed it. */
export const classAssignmentsSchema = z.array(classAssignmentSchema).default([]);

/**
 * `invitedTeachers/{email}` (US-2, US-40): written only by the provisioning scripts through the
 * Admin SDK, read only by `provisionUser` at the claiming sign-in. No page and no Route Handler
 * touches either field, and `firestore.rules` denies both to every client.
 */
export const invitedTeacherSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  permissions: permissionsSchema,
  classAssignments: classAssignmentsSchema,
});
export type InvitedTeacher = z.infer<typeof invitedTeacherSchema>;
