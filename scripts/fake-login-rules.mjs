/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * Widens `firestore.rules` for the projects that have a fake login.
 *
 * The fake login signs people in with a token the server itself signed, which arrives as the
 * `custom` provider. Production has no fake login, so it must not trust that provider — and a
 * permission nothing exercises is not harmless, it is surface with no test behind it.
 *
 * So `firestore.rules` states production's policy and this widens it where the fake login
 * exists, the same way next.config.ts aliases the fake login *in* rather than stubbing it out:
 * whatever goes wrong here, production is deployed the file as it stands.
 *
 * Deciding it inside the rule instead — from `aud`, the project the token was issued for —
 * would be one file and no build step, but `aud` is not among the claims Firebase documents on
 * `request.auth.token`. The emulator could well answer where production does not, which is the
 * one kind of test that reassures without proving anything.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SOURCE_RULES = "firestore.rules";
export const FAKE_LOGIN_RULES = "firestore.fake.rules";

const ENTRA_ONLY = "return request.auth.token.firebase.sign_in_provider == 'microsoft.com';";
const ALSO_THE_SERVER =
  "return request.auth.token.firebase.sign_in_provider in ['microsoft.com', 'custom'];";

/**
 * The rules with the fake login's provider trusted as well.
 *
 * The match is exact and must occur once. Reworded without this file being changed, it throws
 * rather than returning rules that quietly no longer widen.
 *
 * @param {string} source
 * @returns {string}
 */
export function withFakeLogin(source) {
  const occurrences = source.split(ENTRA_ONLY).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Expected exactly one trusted-provider rule in ${SOURCE_RULES}, found ${occurrences}.\n` +
        `  looked for: ${ENTRA_ONLY}\n` +
        "  Reword scripts/fake-login-rules.mjs to match, or the fake login is locked out.",
    );
  }

  return source.replace(ENTRA_ONLY, ALSO_THE_SERVER);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(FAKE_LOGIN_RULES, withFakeLogin(readFileSync(SOURCE_RULES, "utf8")));
  console.log(`Wrote ${FAKE_LOGIN_RULES} — ${SOURCE_RULES}, widened to trust the fake login.`);
}
