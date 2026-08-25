/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema, requiredText } from "./common";

export const userRoleSchema = z.enum(["teacher", "student"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  // The Entra ID UPN doubles as the document id, giving a 1:1 relationship (US-1).
  id: documentIdSchema,
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: z.email(),
  role: userRoleSchema,
});
export type User = z.infer<typeof userSchema>;

/** Keep in sync with the `role` denylist in firestore.rules — no client may ever write it (US-3). */
export const userLockedFields = userSchema.pick({ role: true });
