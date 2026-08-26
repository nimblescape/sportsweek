/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { NextConfig } from "next";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type EnvEntry = { variable: string; value?: string };

// Public Firebase/Entra values live only in apphosting.yaml — reading them here makes
// them available to `next dev`/`next build` without duplicating them into a .env file.
function readEnv(fileName: string): Record<string, string> {
  const apphosting = parse(
    readFileSync(fileURLToPath(new URL(`./${fileName}`, import.meta.url)), "utf8"),
  );
  return Object.fromEntries(
    (apphosting.env ?? [])
      .filter((entry: EnvEntry) => entry.value !== undefined)
      .map((entry: EnvEntry) => [entry.variable, entry.value]),
  );
}

// App Hosting layers apphosting.<environment>.yaml over apphosting.yaml for a backend tagged
// with that environment name. APP_HOSTING_ENV reproduces that locally, so `npm run dev:staging`
// points at staging without editing the production config.
const environment = process.env.APP_HOSTING_ENV;
const env: Record<string, string> = {
  ...readEnv("apphosting.yaml"),
  ...(environment ? readEnv(`apphosting.${environment}.yaml`) : {}),
};

const nextConfig: NextConfig = {
  env,
  // Proxies Firebase's OAuth sign-in helper through our own domain so signInWithRedirect
  // doesn't rely on a cross-origin iframe to *.firebaseapp.com — required since
  // Chrome 115+/Firefox 109+/Safari 16.1+ block that third-party storage access by default.
  // See https://firebase.google.com/docs/auth/web/redirect-best-practices (Option 3).
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
