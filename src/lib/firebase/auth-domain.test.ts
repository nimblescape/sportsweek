/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { resolveAuthDomain } from "@/lib/firebase/auth-domain";

describe("resolveAuthDomain", () => {
  it("uses the current host so the auth handler stays same-origin", () => {
    expect(resolveAuthDomain("sportsweek.htldornbirn.org", "localhost:3000")).toBe(
      "localhost:3000",
    );
  });

  it("keeps working in production, where host and configured domain agree", () => {
    expect(resolveAuthDomain("sportsweek.htldornbirn.org", "sportsweek.htldornbirn.org")).toBe(
      "sportsweek.htldornbirn.org",
    );
  });

  it("falls back to the configured domain when rendering on the server", () => {
    expect(resolveAuthDomain("sportsweek.htldornbirn.org", undefined)).toBe(
      "sportsweek.htldornbirn.org",
    );
  });

  it("never returns a cross-origin domain while running on another host", () => {
    expect(resolveAuthDomain("sportsweek.htldornbirn.org", "127.0.0.1:3000")).not.toBe(
      "sportsweek.htldornbirn.org",
    );
  });
});
