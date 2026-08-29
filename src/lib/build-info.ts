/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/** How much of a sha is shown — git's own default, and enough to name a commit in this repo. */
export const SHORT_COMMIT_LENGTH = 7;

/**
 * What a build platform may call the commit it is building, most specific first. Cloud Build
 * sets both for a repository-triggered build, and App Hosting builds on Cloud Build — so a
 * deployment that hands one over is preferred to reading a repository that may not be there.
 */
export const COMMIT_VARIABLES = ["SHORT_SHA", "COMMIT_SHA"] as const;

const COMMIT_PATTERN = new RegExp(`^[0-9a-f]{${SHORT_COMMIT_LENGTH},40}$`);

/**
 * A sha cut to length, or nothing at all. Anything that is not a sha is refused rather than
 * shown: a platform that leaves a substitution unfilled passes the placeholder through, and
 * `$COMMIT_SHA` on screen says less than an absent hash does.
 */
export function shortCommit(value: string | undefined): string {
  const candidate = (value ?? "").trim().toLowerCase();

  return COMMIT_PATTERN.test(candidate) ? candidate.slice(0, SHORT_COMMIT_LENGTH) : "";
}

/**
 * The commit this build is of. `fromGit` is only asked once no variable has answered, so a
 * build that was told what it is building never starts a process to find out.
 */
export function resolveCommitHash(
  processEnv: Record<string, string | undefined>,
  fromGit: () => string | undefined,
): string {
  for (const variable of COMMIT_VARIABLES) {
    const named = shortCommit(processEnv[variable]);
    if (named !== "") return named;
  }

  return shortCommit(fromGit());
}

/** Whichever of the two the build knew, so a missing hash costs the version its place. */
export function buildInfoLine(version: string | undefined, commit: string | undefined): string {
  return [version ? `v${version}` : "", commit ?? ""].filter(Boolean).join(" · ");
}

/**
 * What this build is, for the status line both roles are shown.
 *
 * The two names are spelled out because Next only inlines a literal `process.env.X`, so they
 * cannot be read from a shared constant — next.config.ts stamps them in under exactly these
 * names, and the test beside this file is what keeps the two ends spelling them alike.
 */
export function buildInfo(): string {
  return buildInfoLine(process.env.NEXT_PUBLIC_APP_VERSION, process.env.NEXT_PUBLIC_COMMIT_HASH);
}
