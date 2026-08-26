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

/** The only project the fake login may ever run against. Named, not merely "not production". */
export const FAKE_LOGIN_PROJECT_ID = "htld-sportsweek-staging";

/**
 * Picks the sign-in implementation for this deployment (`AUTH_MODE`).
 *
 * The fake login forges an identity from a form and provisions it for real, so it is opt-in
 * and confined to one named project. Three things have to fail before it could serve real
 * users: absence of `AUTH_MODE` means Entra ID, so no file has to remember to say so;
 * `.env` is gitignored, so a local override cannot travel with the code; and the project has
 * to be on the allow-list below regardless of what any configuration claims.
 *
 * An allow-list rather than a refusal of production: apphosting.yaml is the base every
 * backend inherits and it carries `fake` for local development, so a backend added later and
 * left unconfigured has to be safe without anyone having thought of it.
 *
 * Deliberately not a `NEXT_PUBLIC_` variable — `next.config.ts` reads it at build time to
 * decide which modules exist, so it never reaches the browser bundle.
 */
export function resolveAuthMode(
  configured: string | undefined,
  projectId: string | undefined,
): AuthMode {
  if (projectId !== FAKE_LOGIN_PROJECT_ID) return "entra";

  const parsed = authModeSchema.safeParse(configured);
  return parsed.success ? parsed.data : "entra";
}

export function currentAuthMode(): AuthMode {
  return resolveAuthMode(process.env.AUTH_MODE, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}
