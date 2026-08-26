/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";

export const authModeSchema = z.enum(["entra", "fake"]);
export type AuthMode = z.infer<typeof authModeSchema>;

/** The one project holding real people's data, and so the one that may never fake a login. */
export const PRODUCTION_PROJECT_ID = "htld-sportsweek";

/** Where teachers try the app out, so impersonation is the point of it rather than an option. */
export const STAGING_PROJECT_ID = "htld-sportsweek-staging";

/** The only project whose sign-in is a choice, because it is the only one developers own. */
export const DEVELOPMENT_PROJECT_ID = "htld-sportsweek-development";

/**
 * Where the sign-in is decided by the project rather than by configuration. Pinning both ends
 * means AUTH_MODE cannot forge an identity in production, and cannot take impersonation away
 * from the people staging exists for.
 */
const PINNED: Record<string, AuthMode> = {
  [PRODUCTION_PROJECT_ID]: "entra",
  [STAGING_PROJECT_ID]: "fake",
};

/**
 * Picks the sign-in implementation for this deployment.
 *
 * The fake login forges an identity from a form and provisions it for real, so which project
 * it runs in is not left to a string: production and staging are pinned here, development is
 * the one place `AUTH_MODE` is read, and every other project — including one added later and
 * never thought about — is served the real sign-in.
 *
 * Deliberately not a `NEXT_PUBLIC_` variable: `next.config.ts` reads the result at build time
 * to decide which modules exist, so outside development the fake login is not merely switched
 * off but absent from the build.
 */
export function resolveAuthMode(
  configured: string | undefined,
  projectId: string | undefined,
): AuthMode {
  if (projectId !== DEVELOPMENT_PROJECT_ID) return PINNED[projectId ?? ""] ?? "entra";

  const parsed = authModeSchema.safeParse(configured);
  return parsed.success ? parsed.data : "entra";
}

export function currentAuthMode(): AuthMode {
  return resolveAuthMode(process.env.AUTH_MODE, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}
