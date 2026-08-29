/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { defineConfig } from "@playwright/test";

// Runs its own plain-HTTP dev server, independent of `npm run dev`'s HTTPS setup
// (which needs locally-generated, gitignored certs) — keeps e2e runnable in CI out of the box.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // "list" for readable console output; add "html" in CI so playwright-report/
  // exists for the upload-artifact step to capture on failure.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    // The base names no Firebase project, so a server started without an environment refuses
    // to load its config. Development is the one the tests are written against: the fake login
    // is what lets them sign in without a tenant account.
    command: "npx next dev -p 3100",
    env: { APP_HOSTING_ENV: "development" },
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
  },
});
