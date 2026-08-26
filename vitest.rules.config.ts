/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate config for Firestore Security Rules tests — run via `npm run test:rules`,
// which wraps this in `firebase emulators:exec` to provide a live Firestore emulator.
export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore-tests/**/*.test.ts"],
    // Several tests here deliberately put a burst of transactions in contention, and the
    // Admin SDK answers that by retrying with backoff — seconds of wall clock is the
    // behaviour under test, not a hang. Vitest's 5s default left no margin at all.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
