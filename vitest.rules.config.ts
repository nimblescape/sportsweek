import { defineConfig } from "vitest/config";

// Separate config for Firestore Security Rules tests — run via `npm run test:rules`,
// which wraps this in `firebase emulators:exec` to provide a live Firestore emulator.
export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore-tests/**/*.test.ts"],
  },
});
