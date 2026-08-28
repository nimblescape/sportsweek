/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { NO_ACTIVE_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import {
  listItemNameSchema,
  namedListSchema,
  programListSchema,
  requiredEquipmentSchema,
  type Program,
} from "@/lib/schemas/master-data";
import {
  categoryOf,
  masterDataCategorySchema,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "./categories";
import { assertEquipmentNotInUse, assertNotInUse } from "./usage-guard";

/**
 * One entry of a maintained list, in the shape the handlers answer with. Five of the six lists
 * store a bare name; only a program carries a list of its own (US-5), so the field is absent
 * rather than empty wherever it would mean nothing.
 */
export type MasterDataItem = { name: string; requiredEquipment?: string[] };

export type MasterDataUpdate = { name?: string; requiredEquipment?: readonly string[] };

function parseName(value: string): string {
  const parsed = listItemNameSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      parsed.error.issues[0]?.message ?? "Ungültiger Name.",
    );
  }
  return parsed.data;
}

/**
 * Uniqueness within the program needs no reservation: the whole list lives in one document, so
 * the write that changes it already sees every sibling (US-5).
 */
function parseEquipment(category: MasterDataCategory, value: readonly string[]): string[] {
  if (category.equipmentField === undefined) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      "Diese Kategorie führt keine Ausrüstungsliste.",
    );
  }

  const parsed = requiredEquipmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.ValidationError,
      parsed.error.issues[0]?.message ?? "Ungültige Ausrüstungsliste.",
    );
  }
  return parsed.data;
}

/** The lists differ in what they store; every operation here works on one uniform shape. */
function itemsOf(series: EventSeries, category: MasterDataCategory): MasterDataItem[] {
  return series[category.field].map((entry) =>
    typeof entry === "string" ? { name: entry } : { ...entry },
  );
}

/**
 * Back to what the document holds, validated on the way — which is where uniqueness and the
 * length cap are decided, so no caller can write a list the schema would refuse (US-21).
 */
function storedList(category: MasterDataCategory, items: readonly MasterDataItem[]) {
  const schema = category.equipmentField === undefined ? namedListSchema : programListSchema;
  const value =
    category.equipmentField === undefined
      ? items.map((item) => item.name)
      : items.map((item): Program => ({
          name: item.name,
          requiredEquipment: item.requiredEquipment ?? [],
        }));

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.Conflict,
      parsed.error.issues[0]?.message ?? "Diese Liste ist ungültig.",
    );
  }
  return parsed.data;
}

/**
 * Which item a request means (US-21). The comparison is the one the whole application uses for
 * names, so a caller that saw "2aWI" still finds the item now spelled "2AWI" — and one that saw
 * a name since changed to something else finds nothing, which is the honest answer.
 */
function indexOf(items: readonly MasterDataItem[], item: string): number {
  const wanted = normalizeName(item);
  return items.findIndex((candidate) => normalizeName(candidate.name) === wanted);
}

function itemAt(items: readonly MasterDataItem[], item: string): MasterDataItem {
  const index = indexOf(items, item);
  if (index === -1) {
    throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
  }
  return items[index]!;
}

function duplicate(name: string): ServiceError {
  return new ServiceError(ErrorCode.Conflict, `Den Namen „${name.trim()}" gibt es hier bereits.`);
}

/**
 * The event series the master data views act on. Until the header selection arrives there is
 * exactly one candidate — the active series (US-4) — so no caller names one, and none can point
 * at a series it was never shown.
 */
async function readActiveEventSeries(): Promise<EventSeries> {
  const found = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  const stored = found.docs[0];
  if (stored === undefined) {
    throw new ServiceError(ErrorCode.Conflict, NO_ACTIVE_EVENT_SERIES_HINT);
  }
  return eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
}

/**
 * Rewrites one list of one event series in a single transaction, so two teachers editing two
 * different lists cannot lose one another's work (US-21). The document is re-read inside it and
 * `change` is applied to what it actually holds, never to the list the client was holding — so a
 * stale caller edits the list as it stands or fails, rather than overwriting what it never saw.
 */ async function writeList(
  eventSeriesId: string,
  category: MasterDataCategory,
  change: (items: MasterDataItem[]) => MasterDataItem[],
): Promise<void> {
  const reference = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
    }

    const series = eventSeriesSchema.parse({ id: eventSeriesId, ...snapshot.data() });
    const next = storedList(category, change(itemsOf(series, category)));

    transaction.update(reference, { [category.field]: next });
  });
}

/**
 * One list of the active event series, for a caller that has to answer a question about it
 * server-side — the in-use report is the only one, and it needs the items to key its answer by.
 */
export async function readMasterDataItems(
  key: MasterDataCategoryKey,
): Promise<{ eventSeriesId: string; items: MasterDataItem[] }> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const series = await readActiveEventSeries();

  return { eventSeriesId: series.id, items: itemsOf(series, category) };
}

export async function createMasterDataItem(
  key: MasterDataCategoryKey,
  input: { name: string; requiredEquipment?: readonly string[] },
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = parseName(input.name);
  const equipment =
    category.equipmentField === undefined && input.requiredEquipment === undefined
      ? undefined
      : parseEquipment(category, input.requiredEquipment ?? []);

  const series = await readActiveEventSeries();
  const item: MasterDataItem =
    equipment === undefined ? { name } : { name, requiredEquipment: equipment };

  // A new item goes to the end of the teacher's order (see Ordering).
  await writeList(series.id, category, (items) => {
    if (indexOf(items, name) !== -1) throw duplicate(name);
    return [...items, item];
  });

  return item;
}

/** Ordering touches no name, so it is deliberately not subject to the in-use guard (see Ordering). */
export async function reorderMasterDataItems(
  key: MasterDataCategoryKey,
  orderedNames: readonly string[],
): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const series = await readActiveEventSeries();

  await writeList(series.id, category, (items) => {
    // A permutation and nothing else: an order naming an item that has since gone, or leaving one
    // out, would silently drop it — so it is refused and the list is left as it stands.
    if (orderedNames.length !== items.length) {
      throw new ServiceError(ErrorCode.Conflict, "Diese Reihenfolge passt nicht zur Liste.");
    }
    return orderedNames.map((name) => itemAt(items, name));
  });
}

/**
 * Renaming is gated by the in-use guard: a registration keeps the plain text of the value it
 * selected (US-11), so a rename would silently orphan every registration still pointing at the
 * old text. Archiving the event series is what releases the item again (US-5 to US-10).
 *
 * The equipment list is held to the same rule, one entry at a time: adding is always fine, but
 * an entry that disappears — removed outright or renamed away — must not be one a student still
 * rents. The list is rewritten whole, so the check is a set difference.
 */
export async function updateMasterDataItem(
  key: MasterDataCategoryKey,
  item: string,
  update: MasterDataUpdate,
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = update.name === undefined ? undefined : parseName(update.name);
  const equipment =
    update.requiredEquipment === undefined
      ? undefined
      : parseEquipment(category, update.requiredEquipment);

  const series = await readActiveEventSeries();
  const current = itemAt(itemsOf(series, category), item);

  if (name !== undefined) await assertNotInUse(series.id, category, current.name);

  if (equipment !== undefined) {
    const kept = new Set(equipment.map(normalizeName));
    const dropped = (current.requiredEquipment ?? []).filter(
      (entry) => !kept.has(normalizeName(entry)),
    );
    await assertEquipmentNotInUse(series.id, dropped);
  }

  const carried =
    current.requiredEquipment === undefined ? {} : { requiredEquipment: current.requiredEquipment };
  const next: MasterDataItem = {
    name: name ?? current.name,
    ...(equipment === undefined ? carried : { requiredEquipment: equipment }),
  };

  await writeList(series.id, category, (items) => {
    const index = indexOf(items, item);
    if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");

    const clash = indexOf(items, next.name);
    if (clash !== -1 && clash !== index) throw duplicate(next.name);

    return items.map((stored, at) => (at === index ? next : stored));
  });

  return next;
}

/**
 * A program's required equipment goes with it, since the list lives on the program itself — so
 * the same restriction applies: an entry a student still rents cannot be removed on its own, and
 * deleting the program must not be a way around that (US-5).
 */
export async function deleteMasterDataItem(
  key: MasterDataCategoryKey,
  item: string,
): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  const series = await readActiveEventSeries();
  const current = itemAt(itemsOf(series, category), item);

  await assertNotInUse(series.id, category, current.name);
  await assertEquipmentNotInUse(series.id, current.requiredEquipment ?? []);

  await writeList(series.id, category, (items) => {
    const index = indexOf(items, item);
    if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
    return items.filter((_, at) => at !== index);
  });
}
