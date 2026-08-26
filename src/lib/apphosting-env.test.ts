/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { envFromApphostingYaml, preferProcessEnv } from "@/lib/apphosting-env";

describe("envFromApphostingYaml", () => {
  it("reads the pinned values", () => {
    expect(
      envFromApphostingYaml({
        env: [
          { variable: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", value: "htld-sportsweek" },
          { variable: "AUTH_MODE", value: "entra" },
        ],
      }),
    ).toEqual({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek", AUTH_MODE: "entra" });
  });

  // A secret has no literal value here — only a Cloud Secret Manager reference to resolve
  // at rollout, so there is nothing for a local build to inline.
  it("skips a variable backed by a secret", () => {
    expect(
      envFromApphostingYaml({
        env: [
          { variable: "API_KEY", secret: "someSecret" },
          { variable: "AUTH_MODE", value: "entra" },
        ],
      }),
    ).toEqual({ AUTH_MODE: "entra" });
  });

  it.each([[{}], [{ env: null }], [{ env: [] }]])("tolerates %o", (parsed) => {
    expect(envFromApphostingYaml(parsed)).toEqual({});
  });
});

describe("preferProcessEnv", () => {
  it("falls back to the file when the variable is not in the environment", () => {
    expect(preferProcessEnv({ AUTH_MODE: "entra" }, {})).toEqual({ AUTH_MODE: "entra" });
  });

  // The regression this exists for: App Hosting merges apphosting.<env>.yaml over the base
  // itself and injects the result, so reading the base file here and winning silently built
  // staging as production.
  it("lets an injected value win over the file", () => {
    expect(
      preferProcessEnv(
        { AUTH_MODE: "entra", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek" },
        { AUTH_MODE: "fake", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek-staging" },
      ),
    ).toEqual({ AUTH_MODE: "fake", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek-staging" });
  });

  // next.config.ts inlines the result into the client bundle, so the yaml files decide what
  // is public. Anything else in the environment stays out, secrets included.
  it("never adopts a variable the files do not declare", () => {
    expect(preferProcessEnv({ AUTH_MODE: "entra" }, { SOME_PRIVATE_TOKEN: "shhh" })).toEqual({
      AUTH_MODE: "entra",
    });
  });

  it("treats an explicitly empty value as set", () => {
    expect(preferProcessEnv({ AUTH_MODE: "entra" }, { AUTH_MODE: "" })).toEqual({ AUTH_MODE: "" });
  });
});
