/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";

export const authModeSchema = z.enum(["entra", "fake"]);
export type AuthMode = z.infer<typeof authModeSchema>;

/**
 * Picks the sign-in implementation for this process (`AUTH_MODE`).
 *
 * The fake login forges an identity from a form, so it is opt-in and local-only. Two
 * independent things have to fail before it could ever serve real users: `.env` is
 * gitignored, so the flag cannot travel with the code, and a production build refuses the
 * mode outright. Deliberately not a `NEXT_PUBLIC_` variable — it is read on the server and
 * handed to the client as a prop, so it is never inlined into the browser bundle.
 */
export function resolveAuthMode(
  configured: string | undefined,
  nodeEnv: string | undefined,
): AuthMode {
  if (nodeEnv === "production") return "entra";

  const parsed = authModeSchema.safeParse(configured);
  return parsed.success ? parsed.data : "entra";
}

export function currentAuthMode(): AuthMode {
  return resolveAuthMode(process.env.AUTH_MODE, process.env.NODE_ENV);
}
