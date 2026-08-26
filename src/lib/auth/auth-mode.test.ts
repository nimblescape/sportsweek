/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "@/lib/auth/auth-mode";

describe("resolveAuthMode", () => {
  it("uses Entra ID when nothing is configured", () => {
    expect(resolveAuthMode(undefined, "development")).toBe("entra");
  });

  it("enables the fake login when a developer opts in", () => {
    expect(resolveAuthMode("fake", "development")).toBe("fake");
  });

  it.each([["entra"], ["FAKE"], ["fake "], [""], ["true"], ["1"]])(
    "falls back to Entra ID for %o",
    (configured) => {
      expect(resolveAuthMode(configured, "development")).toBe("entra");
    },
  );

  // The fake login mints a session for any name typed into a form. `.env` is gitignored, so
  // the flag should never reach a deployment in the first place — this is the second lock.
  it("refuses the fake login in a production build, however it was configured", () => {
    expect(resolveAuthMode("fake", "production")).toBe("entra");
  });
});
