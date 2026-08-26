/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTION_PROJECT_ID, resolveAuthMode } from "@/lib/auth/auth-mode";

const STAGING = "htld-sportsweek-staging";

describe("resolveAuthMode", () => {
  it("uses Entra ID when nothing is configured", () => {
    expect(resolveAuthMode(undefined, STAGING)).toBe("entra");
  });

  it("enables the fake login when a non-production project opts in", () => {
    expect(resolveAuthMode("fake", STAGING)).toBe("fake");
  });

  it.each([["entra"], ["FAKE"], ["fake "], [""], ["true"], ["1"]])(
    "falls back to Entra ID for %o",
    (configured) => {
      expect(resolveAuthMode(configured, STAGING)).toBe("entra");
    },
  );

  // The fake login writes real records into whichever project it points at, so the one project
  // holding real people's data refuses it outright — a stray `fake` in the config is not enough.
  it("refuses the fake login in the production project", () => {
    expect(resolveAuthMode("fake", PRODUCTION_PROJECT_ID)).toBe("entra");
  });

  it("refuses the fake login when the project is unknown", () => {
    expect(resolveAuthMode("fake", undefined)).toBe("entra");
  });

  // An allow-list rather than a deny-list, so a project nobody thought about is safe by
  // default. apphosting.yaml is the base every backend inherits, and it carries `fake` for
  // local development — a new backend that forgot to override it would otherwise get it.
  it.each([["htld-sportsweek-demo"], ["some-other-project"], ["htld-sportsweek-staging-2"]])(
    "refuses the fake login in %o, which was never allowed it",
    (projectId) => {
      expect(resolveAuthMode("fake", projectId)).toBe("entra");
    },
  );
});
