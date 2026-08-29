/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { accountTypeSchema, userSchema, type AccountType } from "@/lib/schemas/user";
import { ROUTES } from "@/lib/routes";

export type AuthenticatedUser = SessionUser & { accountType: AccountType };

/** Account types are hierarchical: a teacher satisfies every student-level check (US-2). */
export function satisfiesAccountType(actual: AccountType, required: AccountType): boolean {
  return actual === required || actual === "teacher";
}

/**
 * The custom claim is a cache. It is missing on the very first login, because the session
 * cookie is minted from an ID token issued before the claim was set — fall back to the record.
 */
export async function resolveAccountType(user: SessionUser): Promise<AccountType | null> {
  if (user.accountType) return user.accountType;
  if (!user.email) return null;

  const snapshot = await adminDb.collection(COLLECTIONS.users).doc(user.email.toLowerCase()).get();
  if (!snapshot.exists) return null;

  const parsed = accountTypeSchema.safeParse(snapshot.data()?.accountType);
  return parsed.success ? parsed.data : null;
}

/** For Route Handlers: returns null instead of redirecting, so the caller emits the error envelope. */
export async function getUserWithAccountType(): Promise<AuthenticatedUser | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const accountType = await resolveAccountType(user);
  return accountType ? { ...user, accountType } : null;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getUserWithAccountType();
  if (!user) redirect(ROUTES.signIn);
  return user;
}

export async function requireTeacher(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.accountType !== "teacher") redirect(ROUTES.appRoot);
  return user;
}

export async function requireStudent(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.accountType !== "student") redirect(ROUTES.appRoot);
  return user;
}

/**
 * The Entra photo kept on the record at sign-in (US-1), for the mark the person is shown by.
 * Null for most accounts, which have none, and for anything that fails to parse as one.
 */
export async function fetchUserPhoto(email: string | null): Promise<string | null> {
  if (!email) return null;

  const snapshot = await adminDb.collection(COLLECTIONS.users).doc(email.toLowerCase()).get();
  const parsed = userSchema.shape.photo.safeParse(snapshot.data()?.photo);
  return parsed.success ? (parsed.data ?? null) : null;
}
