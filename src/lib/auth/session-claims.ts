/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { accountTypeSchema, type AccountType } from "@/lib/schemas/user";

/**
 * Reads the accountType claim from a Firebase session cookie WITHOUT verifying its signature.
 *
 * Optimistic routing only — never authorization. Signature verification needs the Admin SDK,
 * which cannot run in the proxy's Edge runtime, so every protected page re-checks the accountType
 * against the verified session (see lib/auth/guards).
 */
export function readUnverifiedAccountType(sessionCookie: string): AccountType | null {
  const payload = sessionCookie.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const accountType = (claims as { accountType?: unknown } | null)?.accountType;

    const parsed = accountTypeSchema.safeParse(accountType);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
