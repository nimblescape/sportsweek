/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/** Shape of one `env:` entry in an apphosting.yaml. A secret carries a reference, not a value. */
type EnvEntry = { variable: string; value?: string; secret?: string };

export function envFromApphostingYaml(parsed: unknown): Record<string, string> {
  const entries = (parsed as { env?: EnvEntry[] } | null)?.env;
  if (!Array.isArray(entries)) return {};

  return Object.fromEntries(
    entries
      .filter((entry) => entry.value !== undefined)
      .map((entry) => [entry.variable, entry.value as string]),
  );
}

/**
 * App Hosting merges `apphosting.<environment>.yaml` over the base itself and injects the
 * result, so a value already in the environment is the authoritative one — reading the files
 * here is only a stand-in for that when building locally. Getting this backwards silently
 * builds staging as production.
 *
 * Only variables the files declare are carried over: the result is inlined into the client
 * bundle, so the yaml is what decides which values are public.
 */
export function preferProcessEnv(
  fromFiles: Record<string, string>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fromFiles).map(([variable, value]) => [variable, processEnv[variable] ?? value]),
  );
}
