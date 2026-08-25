import { defineConfig } from "@playwright/test";

// Runs its own plain-HTTP dev server, independent of `npm run dev`'s HTTPS setup
// (which needs locally-generated, gitignored certs) — keeps e2e runnable in CI out of the box.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
  },
});
