/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { userRoleSchema, type UserRole } from "@/lib/schemas/user";

export const SESSION_COOKIE_NAME = "__session";

export type SessionUser = {
  uid: string;
  email: string | null;
  role: UserRole | null;
};

/**
 * Verifies the Firebase session cookie and reads the role from custom claims.
 * The claim is a cached mirror of `/users/{uid}.role`: re-sync it whenever the record changes,
 * and fall back to the record for anything security-critical, as `firestore.rules` does.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const role = userRoleSchema.safeParse(decoded.role);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role: role.success ? role.data : null,
    };
  } catch {
    return null;
  }
}
