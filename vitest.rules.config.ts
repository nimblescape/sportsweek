import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate config for Firestore Security Rules tests — run via `npm run test:rules`,
// which wraps this in `firebase emulators:exec` to provide a live Firestore emulator.
export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore-tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
