/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { NextConfig } from "next";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAuthMode } from "./src/lib/auth/auth-mode";
import { envFromApphostingYaml, preferProcessEnv } from "./src/lib/apphosting-env";

// Public Firebase/Entra values live only in apphosting.yaml — reading them here makes
// them available to `next dev`/`next build` without duplicating them into a .env file.
function readEnv(fileName: string): Record<string, string> {
  return envFromApphostingYaml(
    parse(readFileSync(fileURLToPath(new URL(`./${fileName}`, import.meta.url)), "utf8")),
  );
}

// App Hosting layers apphosting.<environment>.yaml over apphosting.yaml for a backend tagged
// with that environment name, and injects the result. APP_HOSTING_ENV reproduces that for a
// local build. Unset, the base alone applies -- which holds the local development values, so
// `npm run dev` never reaches the production database. On App Hosting the injected values are
// the ones that count.
const environment = process.env.APP_HOSTING_ENV;
const env = preferProcessEnv(
  {
    ...readEnv("apphosting.yaml"),
    ...(environment ? readEnv(`apphosting.${environment}.yaml`) : {}),
  },
  process.env,
);

// Whether the fake login is part of this build at all, rather than merely disabled in it.
// `route.fake.ts` only counts as a Route Handler while `fake.ts` is a page extension, so
// outside the one project it is allowed in the file never enters the graph and no
// /api/auth/fake is emitted.
const fakeLogin = resolveAuthMode(env.AUTH_MODE, env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) === "fake";

const nextConfig: NextConfig = {
  env,
  pageExtensions: ["ts", "tsx", ...(fakeLogin ? ["fake.ts", "fake.tsx"] : [])],
  // The rest of it hangs off two facades, which resolve to the production implementation
  // unless a build opts in here. Aliasing the fake login *in* rather than stubbing it out
  // means an alias that stops matching leaves production untouched, and it keeps everything
  // under `fake/` out of the graph on its own: nothing imports it, so nothing pulls it in.
  turbopack: {
    resolveAlias: fakeLogin
      ? {
          "@/components/auth/sign-in-view": "./src/components/auth/fake/sign-in-view.tsx",
          "@/lib/auth/sign-in-policy": "./src/lib/auth/fake/sign-in-policy.ts",
        }
      : {},
  },
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
