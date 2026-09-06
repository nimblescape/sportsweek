/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * What a school configures once, read from `scripts/seed.yml` (gitignored) rather than
 * hardcoded — so a real roster and a real event series can be seeded without ever being
 * committed. `scripts/seed.example.yml` is the tracked, English-language template a new
 * deployment copies and fills in with its own.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { permissionsInputSchema } from "@/lib/auth/permissions";
import { requiredText } from "@/lib/schemas/common";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import { fail } from "./environment.mjs";

const seedUserSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: z.email(),
  // A class of the winter series — the only one bare-seeded, so the only one with classes to
  // assign into before anybody has signed in (US-40). Left with the invitation, not written here.
  classTeacherOf: z.string().optional(),
  permissions: permissionsInputSchema,
});
export type SeedUser = z.infer<typeof seedUserSchema>;

/**
 * An event series exactly as the document holds it (US-21), minus what only the server ever
 * sets — so `scripts/seed.yml` cannot drift into a shape the application would never actually
 * store.
 */
const seedEventSeriesSchema = eventSeriesSchema.omit({
  id: true,
  nameKey: true,
  isArchived: true,
  isOpenToStudents: true,
  hasRegistrations: true,
  position: true,
});
export type SeedEventSeries = z.infer<typeof seedEventSeriesSchema>;

const seedConfigSchema = z.object({
  users: z.array(seedUserSchema),
  eventSeries: z.array(seedEventSeriesSchema),
});
export type SeedConfig = z.infer<typeof seedConfigSchema>;

const SEED_CONFIG_URL = new URL("./seed.yml", import.meta.url);

export function loadSeedConfig(): SeedConfig {
  const raw = parse(readFileSync(fileURLToPath(SEED_CONFIG_URL), "utf8"));
  const parsed = seedConfigSchema.safeParse(raw);

  return parsed.success
    ? parsed.data
    : fail(
        "scripts/seed.yml does not match what a seed expects:",
        ...parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`),
      );
}

export function seedEventSeriesNamed(config: SeedConfig, name: string): SeedEventSeries {
  return (
    config.eventSeries.find((series) => series.name === name) ??
    fail(`scripts/seed.yml names no event series "${name}".`)
  );
}
