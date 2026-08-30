/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/** Shape of one `env:` entry in an apphosting.yaml. A secret carries a reference, not a value. */
type EnvEntry = { variable: string; value?: string; secret?: string };

/**
 * Every variable this app is configured with.
 *
 * Held here rather than derived from the yaml files because App Hosting injects the merged
 * result of a base and an environment file without saying which environment produced it: on a
 * real deployment `APP_HOSTING_ENV` is unset, so only the base is read, and the base names
 * nothing environment-specific. The names have to come from somewhere that is not a file.
 *
 * It is also the guest list. next.config.ts inlines the result, so a variable absent here
 * never reaches a build however it got into the environment.
 */
export const INJECTED_VARIABLES = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_ENTRA_ID_TENANT_ID",
  "AUTH_MODE",
] as const;

/**
 * Variables no deployment ever sets, and which are therefore deliberately absent from the list
 * above: a build only picks one up when the environment file it selected declares it.
 *
 * That absence is the safeguard. Listing FIREBASE_SERVICE_ACCOUNT_ID as injected once put a
 * laptop's account into a production build, because a value in the ambient environment wins
 * over the files and a production build reads no file that names it.
 */
export const LOCAL_ONLY_VARIABLES = ["FIREBASE_SERVICE_ACCOUNT_ID"] as const;

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
 * builds a deployed environment with the base's local development values.
 *
 * Only variables the files declare are carried over: the result is inlined into the client
 * bundle, so the yaml is what decides which values are public.
 */
export function preferProcessEnv(
  fromFiles: Record<string, string>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const names = new Set([...INJECTED_VARIABLES, ...Object.keys(fromFiles)]);

  return Object.fromEntries(
    [...names]
      .map((variable) => [variable, processEnv[variable] ?? fromFiles[variable]])
      .filter(([, value]) => value !== undefined),
  );
}

/**
 * apphosting.yaml holds only what every environment shares, so the project is named by the
 * environment file or by nobody. Failing here is the point: without it a backend left without
 * an Environment name builds an app addressing `undefined`, and the first sign of it is a
 * broken deployment rather than a failed build.
 */
export function requireFirebaseProject<T extends Record<string, string>>(
  env: T,
  environment: string | undefined,
): T {
  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return env;

  throw new Error(
    environment === undefined
      ? "No App Hosting environment selected, so no Firebase project is configured. Set " +
          "APP_HOSTING_ENV (see the dev scripts in package.json), or give the backend an " +
          "Environment name in the App Hosting console."
      : `apphosting.${environment}.yaml names no NEXT_PUBLIC_FIREBASE_PROJECT_ID, and the ` +
          "base deliberately holds nothing environment-specific to fall back on.",
  );
}

/**
 * The tenant pins sign-in to the school's own directory. Left unset, the Microsoft provider
 * falls back to Entra's default, which admits every tenant and every personal account — and a
 * build widened that way looks exactly like one that was not, so the build refuses instead.
 */
export function requireEntraTenant<T extends Record<string, string>>(env: T): T {
  if (env.NEXT_PUBLIC_ENTRA_ID_TENANT_ID) return env;

  throw new Error(
    "apphosting.yaml names no NEXT_PUBLIC_ENTRA_ID_TENANT_ID. Without it the sign-in admits " +
      "every Microsoft tenant and every personal account, which no error would report.",
  );
}
