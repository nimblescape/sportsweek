/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Which Firebase project an environment name stands for, for the scripts that act on one.
 * The answer comes from the apphosting file the argument named rather than from the ambient
 * environment, so a script can only ever address the project it was pointed at.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { envFromApphostingYaml, INJECTED_VARIABLES } from "@/lib/apphosting-env";

type InjectedVariable = (typeof INJECTED_VARIABLES)[number];

export function fail(...lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

export function apphostingValue(environment: string, variable: InjectedVariable): string {
  const file = `apphosting.${environment}.yaml`;
  const values = envFromApphostingYaml(
    parse(readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8")),
  );

  return values[variable] ?? fail(`${file} names no ${variable}.`);
}
