/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/unique-name";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { programSchema } from "@/lib/schemas/master-data";
import { categoryOf, type MasterDataCategoryKey } from "./categories";
import { createMasterDataItem, updateMasterDataItem } from "./master-data-service";

/** US-5: Alternativ deliberately requires nothing. */
const PROGRAM_DEFAULTS = [
  { name: "Ski", equipment: ["Ski", "Skischuhe", "Stöcke", "Helm"] },
  { name: "Snowboard", equipment: ["Board", "Boots", "Helm"] },
  { name: "Alternativ", equipment: [] },
] as const;

/**
 * Classes are absent on purpose: US-6 starts that list empty. "Sonstiges" is likewise absent
 * from the food options — it is always offered to students and is never a row (US-9).
 */
const LIST_DEFAULTS: Partial<Record<MasterDataCategoryKey, readonly string[]>> = {
  "skill-levels": ["Beginner", "Anfänger", "Fortgeschritten", "Profi"],
  "bus-pickup-points": ["HTL Dornbirn", "Bahnhof Feldkirch", "Bahnhof Bregenz", "Unterkunft"],
  "food-options": ["Isst alles", "Vegetarisch", "Vegan", "Kein Schweinefleisch"],
  "season-pass-options": ["Nein", "Vielleicht", "Golm-Bielerhöhe (Illwerke)", "Silvretta-Montafon"],
};

const MARKER_ID = "masterDataDefaults";

function markerRef() {
  return adminDb.collection(COLLECTIONS.seedState).doc(MARKER_ID);
}

function keyOf(category: string, name: string, parent?: string): string {
  return parent === undefined
    ? `${category}|${normalizeName(name)}`
    : `${category}:${normalizeName(parent)}|${normalizeName(name)}`;
}

/**
 * A default is created at most once, ever. What makes that hold is the marker: it records the
 * defaults already dealt with, so a list the teacher has since emptied stays empty and a renamed
 * entry keeps its new name. Recording per default rather than per category also means a default
 * added in a later release still lands, without disturbing the ones already there.
 */
async function alreadySeeded(): Promise<Set<string>> {
  const marker = await markerRef().get();
  const stored = marker.data()?.seededKeys;
  return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
}

/** A default the teacher happened to type in first is already the desired end state. */
async function createIgnoringDuplicates(
  key: MasterDataCategoryKey,
  input: { name: string; requiredEquipment?: readonly string[] },
): Promise<void> {
  try {
    await createMasterDataItem(key, input);
  } catch (error) {
    if (error instanceof ServiceError && error.code === ErrorCode.Conflict) return;
    throw error;
  }
}

async function findProgramByName(name: string) {
  const snapshot = await adminDb
    .collection(categoryOf("programs").collection)
    .where("name", "==", name)
    .get();

  const found = snapshot.docs[0];
  return found === undefined ? null : programSchema.parse({ id: found.id, ...found.data() });
}

/**
 * Brings a fresh environment up with the defaults US-5 and US-7 to US-10 call for. Server-side
 * only, and safe to call on every request: once every key is recorded it costs a single read.
 */
export async function seedMasterDataDefaults(): Promise<void> {
  const seeded = await alreadySeeded();
  const added: string[] = [];

  for (const [category, names] of Object.entries(LIST_DEFAULTS)) {
    for (const name of names) {
      const key = keyOf(category, name);
      if (seeded.has(key)) continue;

      await createIgnoringDuplicates(category as MasterDataCategoryKey, { name });
      added.push(key);
    }
  }

  for (const program of PROGRAM_DEFAULTS) {
    const programKey = keyOf("programs", program.name);
    const pendingEquipment = program.equipment.filter(
      (item) => !seeded.has(keyOf("equipment", item, program.name)),
    );

    if (!seeded.has(programKey)) {
      await createIgnoringDuplicates("programs", {
        name: program.name,
        requiredEquipment: pendingEquipment,
      });
      added.push(
        programKey,
        ...pendingEquipment.map((item) => keyOf("equipment", item, program.name)),
      );
      continue;
    }

    if (pendingEquipment.length === 0) continue;

    // The program predates this run, or the teacher has removed it since.
    const existing = await findProgramByName(program.name);
    if (existing === null) continue;

    await updateMasterDataItem("programs", existing.id, {
      requiredEquipment: [...existing.requiredEquipment, ...pendingEquipment],
    });
    added.push(...pendingEquipment.map((item) => keyOf("equipment", item, program.name)));
  }

  if (added.length > 0) {
    await markerRef().set({ seededKeys: [...seeded, ...added] });
  }
}
