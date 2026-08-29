/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  resolveAuthMode,
} from "@/lib/auth/auth-mode";

const ANY_CONFIGURED = [undefined, "entra", "fake", "FAKE", "fake ", "", "true", "1"];

describe("resolveAuthMode — production", () => {
  // The one project holding real people's data. Nothing may talk it into forging an identity,
  // so AUTH_MODE is not consulted at all rather than merely defaulted.
  it.each(ANY_CONFIGURED)("serves Entra ID whatever AUTH_MODE says (%o)", (configured) => {
    expect(resolveAuthMode(configured, PRODUCTION_PROJECT_ID)).toBe("entra");
  });
});

describe("resolveAuthMode — staging", () => {
  // Where teachers try the app out as several people, so the fake login is the point of it
  // rather than an option: pinned, so no configuration can quietly take it away.
  it.each(ANY_CONFIGURED)("serves the fake login whatever AUTH_MODE says (%o)", (configured) => {
    expect(resolveAuthMode(configured, STAGING_PROJECT_ID)).toBe("fake");
  });
});

describe("resolveAuthMode — development", () => {
  it("serves the fake login when asked for it", () => {
    expect(resolveAuthMode("fake", DEVELOPMENT_PROJECT_ID)).toBe("fake");
  });

  it("rehearses the real sign-in when asked for it", () => {
    expect(resolveAuthMode("entra", DEVELOPMENT_PROJECT_ID)).toBe("entra");
  });

  it.each([[undefined], ["FAKE"], ["fake "], [""], ["true"], ["1"]])(
    "falls back to Entra ID for %o",
    (configured) => {
      expect(resolveAuthMode(configured, DEVELOPMENT_PROJECT_ID)).toBe("entra");
    },
  );
});

describe("resolveAuthMode — anywhere else", () => {
  // An allow-list, so a project nobody thought about is safe without anyone having thought
  // about it. Only the three named above have a policy; everything else gets the real thing.
  it.each([[undefined], ["htld-sportsweek-demo"], ["htld-sportsweek-staging-2"], ["whatever"]])(
    "serves Entra ID in %o even when the fake login is asked for",
    (projectId) => {
      expect(resolveAuthMode("fake", projectId)).toBe("entra");
    },
  );
});
