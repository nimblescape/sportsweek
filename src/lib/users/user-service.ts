/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { accountTypeSchema } from "@/lib/schemas/user";
import { permissionsSchema, type Permission } from "@/lib/auth/permissions";

export const SELF_DEMOTION_HINT =
  "Du kannst dir das Recht, Benutzerrechte zu vergeben, nicht selbst entziehen.";

export const NOT_A_TEACHER_HINT = "Nur Lehrpersonen können Rechte erhalten.";

const UNKNOWN_PERSON_HINT = "Diese Person hat sich noch nie angemeldet.";

/**
 * Grants exactly the set named, replacing whatever was held (US-2).
 *
 * The refusals here are the ones a Security Rule cannot make: it cannot check that the target is
 * a teacher without a second read it has no way to relate, and it cannot express the one rule
 * that keeps somebody able to hand permissions out at all.
 *
 * That rule is self-removal. Only the last holder can be the last one — anyone else taking it
 * from them would have to hold it themselves — so refusing to take `editUsers` off yourself
 * leaves at least one holder without ever counting them, and counting is what a transaction
 * would have to serialise. Everything else about your own record stays yours to change.
 *
 * The read and the write share a transaction, so two admins withdrawing each other at the same
 * moment cannot both pass a check made before the other's write.
 */
export async function grantPermissions(
  uid: string,
  wanted: readonly Permission[],
  actorUid: string,
): Promise<readonly Permission[]> {
  const permissions = permissionsSchema.safeParse(wanted);
  if (!permissions.success) {
    throw new ServiceError(ErrorCode.ValidationError, "Diese Rechte gibt es so nicht.");
  }

  const reference = adminDb.collection(COLLECTIONS.users).doc(uid);

  return adminDb.runTransaction(async (transaction) => {
    const stored = await transaction.get(reference);
    if (!stored.exists) {
      throw new ServiceError(ErrorCode.NotFound, UNKNOWN_PERSON_HINT);
    }

    if (accountTypeSchema.safeParse(stored.data()?.accountType).data !== "teacher") {
      throw new ServiceError(ErrorCode.Conflict, NOT_A_TEACHER_HINT);
    }

    const held = permissionsSchema.safeParse(stored.data()?.permissions);
    const losesEditUsers =
      (held.success ? held.data : []).includes("editUsers") &&
      !permissions.data.includes("editUsers");

    if (uid === actorUid && losesEditUsers) {
      throw new ServiceError(ErrorCode.Conflict, SELF_DEMOTION_HINT);
    }

    transaction.update(reference, { permissions: permissions.data });
    return permissions.data;
  });
}
