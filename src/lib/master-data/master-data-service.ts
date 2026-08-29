/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { NO_SUCH_EVENT_SERIES } from "@/lib/event-series/event-series-state";
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

/** What a list edit is handed so its guard can run inside the write's own transaction. */
type EditContext = { transaction: Transaction; eventSeriesId: string };

function eventSeriesDoc(eventSeriesId: string) {
  return adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
}

function missing(): ServiceError {
  return new ServiceError(ErrorCode.NotFound, NO_SUCH_EVENT_SERIES);
}

/**
 * Everything one list edit does, in a single transaction: read the event series the caller named,
 * apply the change to the list as it actually stands, and write it.
 *
 * `change` is handed the transaction because the in-use guard has to run inside it. Asked
 * beforehand, its answer is stale by the time the write lands — a student choosing the value
 * being removed in between would be left holding something the series no longer offers, and
 * nothing repairs that (US-5 to US-10). Firestore locks the ranges the guard's queries scan, so
 * such a save conflicts and one of the two retries and sees the other.
 *
 * The list is re-read here rather than taken from the client, so a stale caller edits the list
 * as it stands or fails, rather than overwriting one it never saw (US-21).
 */
async function editList(
  eventSeriesId: string,
  category: MasterDataCategory,
  change: (items: MasterDataItem[], context: EditContext) => Promise<MasterDataItem[]>,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const reference = eventSeriesDoc(eventSeriesId);
    const stored = await transaction.get(reference);
    if (!stored.exists) throw missing();

    const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
    const context = { transaction, eventSeriesId: series.id };
    const next = storedList(category, await change(itemsOf(series, category), context));

    transaction.update(reference, { [category.field]: next });
  });
}

/**
 * One list of one event series, for a caller that has to answer a question about it server-side —
 * the in-use report is the only one, and it needs the items to key its answer by.
 */
export async function readMasterDataItems(
  eventSeriesId: string,
  key: MasterDataCategoryKey,
): Promise<{ eventSeriesId: string; items: MasterDataItem[] }> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const stored = await eventSeriesDoc(eventSeriesId).get();
  if (!stored.exists) throw missing();

  const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });

  return { eventSeriesId: series.id, items: itemsOf(series, category) };
}

export async function createMasterDataItem(
  eventSeriesId: string,
  key: MasterDataCategoryKey,
  input: { name: string; requiredEquipment?: readonly string[] },
): Promise<MasterDataItem> {
  const category = categoryOf(masterDataCategorySchema.parse(key));
  const name = parseName(input.name);
  const equipment =
    category.equipmentField === undefined && input.requiredEquipment === undefined
      ? undefined
      : parseEquipment(category, input.requiredEquipment ?? []);

  const item: MasterDataItem =
    equipment === undefined ? { name } : { name, requiredEquipment: equipment };

  // Adding strands nothing, so it needs no guard: a value nobody could have chosen yet cannot
  // be one a registration holds. A new item goes to the end of the order (see Ordering).
  await editList(eventSeriesId, category, async (items) => {
    if (indexOf(items, name) !== -1) throw duplicate(name);
    return [...items, item];
  });

  return item;
}

/** Ordering touches no stored value, so it too is free of the guard (see Ordering). */
export async function reorderMasterDataItems(
  eventSeriesId: string,
  key: MasterDataCategoryKey,
  orderedNames: readonly string[],
): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  await editList(eventSeriesId, category, async (items) => {
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
  eventSeriesId: string,
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

  let next!: MasterDataItem;

  await editList(eventSeriesId, category, async (items, { transaction, eventSeriesId }) => {
    const index = indexOf(items, item);
    if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
    const current = items[index]!;

    if (name !== undefined) {
      await assertNotInUse(transaction, eventSeriesId, category, current.name);
    }

    if (equipment !== undefined) {
      const kept = new Set(equipment.map(normalizeName));
      const dropped = (current.requiredEquipment ?? []).filter(
        (entry) => !kept.has(normalizeName(entry)),
      );
      await assertEquipmentNotInUse(transaction, eventSeriesId, dropped);
    }

    const carried =
      current.requiredEquipment === undefined
        ? {}
        : { requiredEquipment: current.requiredEquipment };
    next = {
      name: name ?? current.name,
      ...(equipment === undefined ? carried : { requiredEquipment: equipment }),
    };

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
  eventSeriesId: string,
  key: MasterDataCategoryKey,
  item: string,
): Promise<void> {
  const category = categoryOf(masterDataCategorySchema.parse(key));

  await editList(eventSeriesId, category, async (items, { transaction, eventSeriesId }) => {
    const index = indexOf(items, item);
    if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Diesen Eintrag gibt es nicht.");
    const current = items[index]!;

    await assertNotInUse(transaction, eventSeriesId, category, current.name);
    await assertEquipmentNotInUse(transaction, eventSeriesId, current.requiredEquipment ?? []);

    return items.filter((_, at) => at !== index);
  });
}
