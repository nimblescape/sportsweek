/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import type { AccountType } from "@/lib/schemas/user";

/**
 * What a teacher may do, as against what they are (US-2). A set rather than a rank: nothing reads
 * the order as seniority, each permission is asked for by name, and none stands in for another.
 *
 * The order is the navigation's — the overview, the assignment, the report, the master data, the
 * rights page — which is the one source of order the tag row and the bar both follow.
 *
 * There is no bundling layer, so what is granted is what is checked. Should these outgrow a
 * single row, the word "role" is still free for a bundle of them.
 */
export const PERMISSIONS = [
  "editRegistrations",
  "editAssignments",
  "viewReports",
  "editReports",
  "editMasterData",
  "editUsers",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  editRegistrations: "Registrierungen bearbeiten",
  editAssignments: "Zuteilung",
  viewReports: "Berichte ansehen",
  editReports: "Berichte bearbeiten",
  editMasterData: "Stammdaten",
  editUsers: "Benutzerrechte",
};

/**
 * Two permissions that cannot be held together, weaker first. Both open the report page, so
 * holding both would say nothing the stronger does not say already — pressing either clears the
 * other, and a record naming both is refused rather than quietly reduced.
 */
const EXCLUSIVE = [["viewReports", "editReports"]] as const satisfies readonly (readonly [
  Permission,
  Permission,
])[];

/**
 * Everything one person can hold at once, which is not the list itself: where two exclude each
 * other only the stronger is here. It is what the school's first teacher is provisioned with, so
 * a permission added above reaches them without anybody remembering to add it twice.
 */
export const FULL_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => !EXCLUSIVE.some(([weaker]) => weaker === permission),
);

export const permissionSchema = z.enum(PERMISSIONS);

/**
 * What a caller has to say out loud. Granting is a replacement rather than a patch, so an absent
 * list is a request that means nothing and is refused rather than read as "none".
 */
export const permissionsInputSchema = z
  .array(permissionSchema)
  .max(PERMISSIONS.length)
  .refine((permissions) => new Set(permissions).size === permissions.length, {
    message: "Eine Berechtigung darf nur einmal vorkommen.",
  })
  .refine(
    (permissions) =>
      EXCLUSIVE.every(
        ([weaker, stronger]) => !(permissions.includes(weaker) && permissions.includes(stronger)),
      ),
    { message: "Berichte ansehen und Berichte bearbeiten schließen einander aus." },
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

/** The same question of several at once, for a page that either of two permissions opens. */
export function mayAny(user: Principal, required: readonly Permission[]): boolean {
  return required.some((permission) => may(user, permission));
}

/**
 * The tag row's rule, kept here so the page and the handler cannot disagree about what a press
 * means: pressing one of an exclusive pair takes the place of the other rather than joining it.
 */
export function toggledPermissions(
  held: readonly Permission[],
  permission: Permission,
): readonly Permission[] {
  const wanted = new Set<Permission>(held);

  if (wanted.has(permission)) {
    wanted.delete(permission);
  } else {
    wanted.add(permission);
    for (const [weaker, stronger] of EXCLUSIVE) {
      if (permission === weaker) wanted.delete(stronger);
      if (permission === stronger) wanted.delete(weaker);
    }
  }

  return PERMISSIONS.filter((one) => wanted.has(one));
}
