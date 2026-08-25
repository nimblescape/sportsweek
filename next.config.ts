import type { NextConfig } from "next";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Public Firebase/Entra values live only in apphosting.yaml — reading them here makes
// them available to `next dev`/`next build` without duplicating them into a .env file.
const apphosting = parse(
  readFileSync(fileURLToPath(new URL("./apphosting.yaml", import.meta.url)), "utf8"),
);
const env: Record<string, string> = Object.fromEntries(
  (apphosting.env ?? [])
    .filter((entry: { value?: string }) => entry.value !== undefined)
    .map((entry: { variable: string; value: string }) => [entry.variable, entry.value]),
);

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
        destination: "https://htld-sportsweek.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
};

export default nextConfig;
