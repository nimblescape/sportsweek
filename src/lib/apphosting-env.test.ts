/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { envFromApphostingYaml, preferProcessEnv } from "@/lib/apphosting-env";
import {
  FAKE_LOGIN_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  resolveAuthMode,
} from "@/lib/auth/auth-mode";

function readEnv(fileName: string): Record<string, string> {
  return envFromApphostingYaml(parse(readFileSync(resolve(process.cwd(), fileName), "utf8")));
}

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

/**
 * App Hosting layers apphosting.<environment>.yaml over apphosting.yaml and injects the
 * result, so the base is not a neutral file: it is what a deployed backend falls back to. It
 * holds the local development values, which point at the project the fake login is allowed
 * in — so anything a deployed environment forgets to restate, it inherits from there.
 */
describe("the apphosting yaml files", () => {
  const base = readEnv("apphosting.yaml");
  const production = readEnv("apphosting.production.yaml");
  const staging = readEnv("apphosting.staging.yaml");

  const firebaseVariables = Object.keys(base).filter((name) =>
    name.startsWith("NEXT_PUBLIC_FIREBASE_"),
  );

  it("has something to check, so an empty read cannot pass the rest", () => {
    expect(firebaseVariables.length).toBeGreaterThan(0);
  });

  it.each([
    ["production", () => production],
    ["staging", () => staging],
  ])("restates every Firebase value in %s rather than inheriting one", (_name, file) => {
    expect(Object.keys(file())).toEqual(expect.arrayContaining(firebaseVariables));
  });

  it("points local development at the one project the fake login is allowed in", () => {
    expect(base.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe(FAKE_LOGIN_PROJECT_ID);
  });

  it("points production at the production project", () => {
    expect(production.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe(PRODUCTION_PROJECT_ID);
  });

  // Not `AUTH_MODE: entra`: saying nothing is what makes Entra ID the answer, so the file
  // cannot drift into claiming something else, and a new environment file is safe empty.
  it("leaves AUTH_MODE unset in production, where absence means Entra ID", () => {
    expect(production).not.toHaveProperty("AUTH_MODE");
  });

  // What the two files above actually add up to. Production inherits `fake` from the base and
  // is served Entra ID regardless, because the project decides the mode and not the string —
  // so no file has to remember to switch the fake login off.
  it.each([
    ["production", () => production, "entra"],
    ["staging", () => staging, "fake"],
    ["local", () => ({}) as Record<string, string>, "fake"],
  ])("resolves %s to the %s sign-in once merged over the base", (_name, file, expected) => {
    const merged = { ...base, ...file() };

    expect(resolveAuthMode(merged.AUTH_MODE, merged.NEXT_PUBLIC_FIREBASE_PROJECT_ID)).toBe(
      expected,
    );
  });
});
