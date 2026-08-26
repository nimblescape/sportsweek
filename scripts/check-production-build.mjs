/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * Asserts that a production build contains no trace of the fake login.
 *
 * next.config.ts keeps `route.fake.ts` out of the module graph by resolving the auth mode from
 * the project id, and unit tests cover that decision. What they cannot cover is the artifact:
 * a page extension, an alias or an import added later could put the module back without any
 * test noticing, because every test would still pass. So this reads what was actually built.
 *
 * It builds that artifact itself, from an emptied directory. Turbopack leaves the chunks of
 * previous builds behind, so a check run against whatever `.next` happens to hold reports the
 * last build as well as this one -- which looked exactly like a leak the first time it did it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const BUILD_DIR = ".next";
const SEARCHED = ["server", "static"];

/**
 * Strings that appear in a build including the fake login and in no other. Verified against
 * both builds rather than assumed: `createCustomToken` looks like an obvious marker and is
 * useless, because firebase-admin defines the method whether anything calls it or not.
 */
const FORBIDDEN = ["api/auth/fake", "auth/fake", "__entra_session"];

function projectIdOf(fileName) {
  const parsed = parse(readFileSync(fileName, "utf8"));
  return (parsed.env ?? []).find((e) => e.variable === "NEXT_PUBLIC_FIREBASE_PROJECT_ID")?.value;
}

function* filesUnder(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const production = projectIdOf("apphosting.production.yaml");
const others = ["apphosting.development.yaml", "apphosting.staging.yaml"].map(projectIdOf);

rmSync(BUILD_DIR, { recursive: true, force: true });
execFileSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, APP_HOSTING_ENV: "production" },
});

const contents = new Map();
for (const directory of SEARCHED) {
  for (const path of filesUnder(join(BUILD_DIR, directory))) {
    contents.set(path, readFileSync(path, "latin1"));
  }
}
contents.set(
  `${BUILD_DIR}/routes-manifest.json`,
  readFileSync(`${BUILD_DIR}/routes-manifest.json`, "utf8"),
);

const mentions = (needle) => [...contents].filter(([, body]) => body.includes(needle));

const offences = FORBIDDEN.flatMap((needle) =>
  mentions(needle).map(([path]) => `  ${needle} in ${path}`),
);

if (offences.length > 0) {
  fail(
    "The fake login is present in a production build. It forges identities and provisions",
    "them for real, so it must not exist in the artifact at all — not merely be switched off.",
    ...offences.slice(0, 20),
    offences.length > 20 ? `  ...and ${offences.length - 20} more` : "",
  );
}

/**
 * What next.config.ts actually resolved, rather than any string that happens to appear in a
 * chunk: the project ids of the other environments are legitimately present as constants in
 * the auth policy, so a substring search reports them and means nothing.
 */
const resolved =
  JSON.parse(readFileSync(`${BUILD_DIR}/required-server-files.json`, "utf8")).config?.env ?? {};

if (resolved.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== production) {
  fail(
    `The build is configured for ${resolved.NEXT_PUBLIC_FIREBASE_PROJECT_ID}, not ${production}.`,
  );
}

// A .env on the machine doing the build wins over the yaml files, so this is where one
// environment's value ends up baked into another's artifact.
for (const other of others) {
  const naming = Object.entries(resolved).filter(([, value]) => String(value).includes(other));
  if (naming.length > 0) {
    fail(
      `A production build carries values naming ${other}:`,
      ...naming.map(([variable, value]) => `  ${variable}=${value}`),
    );
  }
}

console.log(`Checked ${contents.size} built files for ${production}. No trace of the fake login.`);
