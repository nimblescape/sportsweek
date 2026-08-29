/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import type { AccountType } from "@/lib/schemas/user";

/**
 * What a teacher may do, as against what they are (US-2). A set rather than a rank: the order is
 * the tag row's, running from the least a teacher may do to the most, and nothing reads it as
 * seniority — each permission is asked for by name, and none stands in for another.
 *
 * There is no bundling layer, so what is granted is what is checked. Should these outgrow a
 * single row, the word "role" is still free for a bundle of them.
 */
export const PERMISSIONS = [
  "viewReports",
  "editReports",
  "editAssignments",
  "editMasterData",
  "editUsers",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  viewReports: "Berichte ansehen",
  editReports: "Berichte bearbeiten",
  editAssignments: "Zuteilung",
  editMasterData: "Stammdaten",
  editUsers: "Benutzerrechte",
};

/**
 * A permission that cannot be held without another. Saving a report you may not see is not a
 * state worth being able to describe, so the pair travels together in both directions.
 */
const REQUIRES = [["editReports", "viewReports"]] as const satisfies readonly (readonly [
  Permission,
  Permission,
])[];

export const permissionSchema = z.enum(PERMISSIONS);

/**
 * What a caller has to say out loud. Granting is a replacement rather than a patch, so an
 * absent list is a request that means nothing and is refused rather than read as "none".
 */
export const permissionsInputSchema = z
  .array(permissionSchema)
  .max(PERMISSIONS.length)
  .refine((permissions) => new Set(permissions).size === permissions.length, {
    message: "Eine Berechtigung darf nur einmal vorkommen.",
  })
  .refine(
    (permissions) =>
      REQUIRES.every(
        ([permission, required]) =>
          !permissions.includes(permission) || permissions.includes(required),
      ),
    { message: "Berichte bearbeiten setzt Berichte ansehen voraus." },
  );

/** The same, as a record carries it: one written before permissions existed holds none. */
export const permissionsSchema = permissionsInputSchema.default([]);

/** Whoever is being asked about, narrowed to the two fields that decide it. */
type Principal = { accountType: AccountType; permissions: readonly Permission[] };

/**
 * The one question the rest of the application asks. It takes the person rather than their list,
 * so a permission cannot be checked without also saying whose it is — which is what keeps a
 * student refused by what they are, ahead of whatever their record happens to carry (US-3).
 */
export function may(user: Principal, required: Permission): boolean {
  return user.accountType === "teacher" && user.permissions.includes(required);
}

/**
 * The tag row's rule, kept here so the page and the handler cannot disagree about what a press
 * means: a permission arrives with whatever it depends on, and leaves with whatever depends on it.
 */
export function toggledPermissions(
  held: readonly Permission[],
  permission: Permission,
): readonly Permission[] {
  const wanted = new Set<Permission>(held);

  if (wanted.has(permission)) {
    wanted.delete(permission);
    for (const [dependent, required] of REQUIRES) {
      if (required === permission) wanted.delete(dependent);
    }
  } else {
    wanted.add(permission);
    for (const [dependent, required] of REQUIRES) {
      if (dependent === permission) wanted.add(required);
    }
  }

  return PERMISSIONS.filter((one) => wanted.has(one));
}
