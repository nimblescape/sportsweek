/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { permissionsSchema } from "@/lib/auth/permissions";
import { requiredText, uidSchema } from "./common";

export const accountTypeSchema = z.enum(["teacher", "student"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const userSchema = z.object({
  // The address the school issued doubles as the document id, giving a 1:1 relationship (US-1).
  id: uidSchema,
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: z.email(),
  accountType: accountTypeSchema,
  /**
   * What this person may do, as against what they are (US-2). Empty for every student, and for
   * a teacher until an admin grants something — a record carrying none reaches nothing.
   */
  permissions: permissionsSchema,
  // The Entra photo itself, as a data URL, rather than an address: Graph serves it to a bearer
  // token, and the token belongs to the sign-in that fetched it. Absent for most accounts.
  photo: z.string().nullish(),
});
export type User = z.infer<typeof userSchema>;

/** Keep in sync with the denylist in firestore.rules — no client may ever write these (US-3). */
export const userLockedFields = userSchema.pick({ accountType: true, permissions: true });
