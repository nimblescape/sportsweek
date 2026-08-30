/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import {
  envFromApphostingYaml,
  INJECTED_VARIABLES,
  LOCAL_ONLY_VARIABLES,
  preferProcessEnv,
  requireFirebaseProject,
  requireEntraTenant,
} from "@/lib/apphosting-env";
import {
  DEVELOPMENT_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
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

  // On App Hosting nothing selects an environment file: the merged result is injected and
  // APP_HOSTING_ENV is unset, so only the base is read — and the base names no project. The
  // variables the app is configured with therefore have to be known independently of any file.
  it("carries an injected variable that no file read here declared", () => {
    expect(preferProcessEnv({}, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek" })).toEqual({
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek",
    });
  });

  it("leaves out a variable neither the files nor the environment set", () => {
    expect(preferProcessEnv({}, {})).toEqual({});
  });

  it("treats an explicitly empty value as set", () => {
    expect(preferProcessEnv({ AUTH_MODE: "entra" }, { AUTH_MODE: "" })).toEqual({ AUTH_MODE: "" });
  });
});

/**
 * App Hosting layers apphosting.<environment>.yaml over apphosting.yaml and injects the
 * result, so the base is not a neutral file: it is what a deployed backend falls back to.
 * It therefore holds only what every environment shares, and nothing an environment could
 * be handed by forgetting to ask.
 */
describe("the apphosting yaml files", () => {
  const base = readEnv("apphosting.yaml");
  const environments = {
    development: readEnv("apphosting.development.yaml"),
    staging: readEnv("apphosting.staging.yaml"),
    production: readEnv("apphosting.production.yaml"),
  };

  const firebaseVariablesOf = (env: Record<string, string>) =>
    Object.keys(env)
      .filter((name) => name.startsWith("NEXT_PUBLIC_FIREBASE_"))
      .sort();

  it("has something to check, so an empty read cannot pass the rest", () => {
    expect(firebaseVariablesOf(environments.production).length).toBeGreaterThan(0);
  });

  // Nothing environment-specific in the base means nothing to inherit by accident: an
  // environment that fails to name its project gets none, rather than somebody else's.
  it("keeps every Firebase value out of the base", () => {
    expect(firebaseVariablesOf(base)).toEqual([]);
  });

  it("declares the same Firebase values in every environment, so none is half-configured", () => {
    const [reference, ...rest] = Object.values(environments).map(firebaseVariablesOf);

    for (const declared of rest) expect(declared).toEqual(reference);
  });

  it.each([
    ["development", DEVELOPMENT_PROJECT_ID],
    ["staging", STAGING_PROJECT_ID],
    ["production", PRODUCTION_PROJECT_ID],
  ] as const)("points %s at %s", (name, projectId) => {
    expect(environments[name].NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe(projectId);
  });

  // The base is inherited by every backend, so the fake login may not be spelled there.
  it("never spells out an AUTH_MODE in the base", () => {
    expect(base).not.toHaveProperty("AUTH_MODE");
  });

  // resolveAuthMode pins production and staging, so an AUTH_MODE in either file would be a
  // second answer to a question already settled — read by nobody, and wrong the moment the
  // pinned one changes. Development is the only environment that gets to say.
  it("names AUTH_MODE in exactly one environment, the one that is asked", () => {
    const naming = Object.entries(environments)
      .filter(([, file]) => "AUTH_MODE" in file)
      .map(([name]) => name);

    expect(naming).toEqual(["development"]);
  });

  // A deployment signs with the credential its metadata server hands it, and App Hosting's
  // compute account may sign as itself and as nothing else -- so naming an account in a
  // deployed environment's file would break its fake login rather than enable it.
  it.each([["staging"], ["production"]] as const)("names no signing account in %s", (name) => {
    for (const variable of LOCAL_ONLY_VARIABLES) {
      expect(environments[name]).not.toHaveProperty(variable);
    }
  });

  // Kept out of INJECTED_VARIABLES on purpose: a value in the surrounding environment beats
  // the files, so listing it once put a laptop's account into a production build.
  it("never lets a local-only variable be picked up from the environment", () => {
    for (const variable of LOCAL_ONLY_VARIABLES) {
      expect(INJECTED_VARIABLES).not.toContain(variable);
      expect(preferProcessEnv({}, { [variable]: "someone-elses-account" })).toEqual({});
    }
  });

  // The names the app is configured with are held in code, because App Hosting injects values
  // without saying which file produced them. A variable added to a yaml and not to that list
  // would be read locally and silently missing on a deployment.
  it("declares every variable it uses in INJECTED_VARIABLES", () => {
    const inYaml = new Set([base, ...Object.values(environments)].flatMap(Object.keys));
    const known = [...INJECTED_VARIABLES, ...LOCAL_ONLY_VARIABLES];

    for (const variable of inYaml) expect(known).toContain(variable);
  });

  // Not `AUTH_MODE: entra`: saying nothing is what makes Entra ID the answer, so the file
  // cannot drift into claiming something else, and a new environment file is safe empty.
  it("leaves AUTH_MODE unset in production, where absence means Entra ID", () => {
    expect(environments.production).not.toHaveProperty("AUTH_MODE");
  });

  // What the files above add up to once resolveAuthMode has the last word. Only development
  // is decided by a file; the other two are decided by which project they name.
  it.each([
    ["development", () => environments.development, "fake"],
    ["staging", () => environments.staging, "fake"],
    ["production", () => environments.production, "entra"],
    ["no environment file at all", () => ({}) as Record<string, string>, "entra"],
  ])("resolves %s to the %s sign-in once merged over the base", (_name, file, expected) => {
    const merged = { ...base, ...file() };

    expect(resolveAuthMode(merged.AUTH_MODE, merged.NEXT_PUBLIC_FIREBASE_PROJECT_ID)).toBe(
      expected,
    );
  });

  // Renaming an environment file leaves the scripts naming the old one, and the failure is an
  // ENOENT from inside next.config.ts rather than anything that says which script was wrong.
  it("has a file for every environment package.json offers a script for", () => {
    const scripts: Record<string, string> = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ).scripts;

    const named = Object.values(scripts).flatMap((command) =>
      [...command.matchAll(/APP_HOSTING_ENV=(\w+)/g)].map((match) => match[1]),
    );

    expect(named.length).toBeGreaterThan(0);
    for (const environment of named) {
      expect(existsSync(resolve(process.cwd(), `apphosting.${environment}.yaml`))).toBe(true);
    }
  });
});

/**
 * With no project in the base, a build that selects no environment has no project either.
 * Saying so is the point: Next would otherwise build an app addressing `undefined`, and the
 * first sign of it would be a broken deployment rather than a failed build.
 */
describe("requireFirebaseProject", () => {
  it("passes the environment through once a project is named", () => {
    const env = { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "htld-sportsweek" };

    expect(requireFirebaseProject(env, "production")).toBe(env);
  });

  it.each([[{}], [{ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "" }]])("refuses %o", (env) => {
    expect(() => requireFirebaseProject(env, "production")).toThrow(/apphosting\.production/);
  });

  it("names APP_HOSTING_ENV when no environment was selected at all", () => {
    expect(() => requireFirebaseProject({}, undefined)).toThrow(/APP_HOSTING_ENV/);
  });
});

/**
 * Unset, the Microsoft provider falls back to Entra's own default, which admits every tenant
 * and every personal account. That is a widening no error reports, so the build refuses instead.
 */
describe("requireEntraTenant", () => {
  it("passes the environment through once a tenant is named", () => {
    const env = { NEXT_PUBLIC_ENTRA_ID_TENANT_ID: "a-tenant-guid" };

    expect(requireEntraTenant(env)).toBe(env);
  });

  it.each([[{}], [{ NEXT_PUBLIC_ENTRA_ID_TENANT_ID: "" }]])("refuses %o", (env) => {
    expect(() => requireEntraTenant(env)).toThrow(/NEXT_PUBLIC_ENTRA_ID_TENANT_ID/);
  });

  /** The reason has to be in the message: an unpinned build looks exactly like a working one. */
  it("says what an unpinned build would admit", () => {
    expect(() => requireEntraTenant({})).toThrow(/every Microsoft tenant/);
  });
});
