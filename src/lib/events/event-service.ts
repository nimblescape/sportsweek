/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { normalizeName } from "@/lib/firebase/name-key";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { listItemNameSchema, namedListSchema } from "@/lib/schemas/master-data";

/**
 * The events of one event series, held in an ordered array on its document like every other list
 * it maintains (US-21). They are not a master data category: their page is reached through an
 * event series rather than through the master data menu, so every call here names the series it
 * acts on instead of working out which one was meant (US-4).
 */
function eventSeriesDoc(id: string) {
  return adminDb.collection(COLLECTIONS.eventSeries).doc(id);
}

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
 * Which event a request means. The comparison is the one the whole application uses for names,
 * so a caller that saw "Woche 1" still finds the event now spelled "woche 1" — and one that saw
 * a name since changed to something else finds nothing, which is the honest answer (US-21).
 */
function indexOf(events: readonly string[], event: string): number {
  const wanted = normalizeName(event);
  return events.findIndex((candidate) => normalizeName(candidate) === wanted);
}

function requireIndex(events: readonly string[], event: string): number {
  const index = indexOf(events, event);
  if (index === -1) throw new ServiceError(ErrorCode.NotFound, "Dieses Event gibt es nicht.");
  return index;
}

function duplicate(name: string): ServiceError {
  return new ServiceError(ErrorCode.Conflict, `Den Namen „${name.trim()}" gibt es hier bereits.`);
}

/**
 * Back to what the document holds, validated on the way — which is where uniqueness and the
 * length cap are decided, so no caller can write a list the schema would refuse. Two series may
 * each hold a "Montafon" without either ever looking at the other (US-4, US-21).
 */
function storedEvents(events: readonly string[]): string[] {
  const parsed = namedListSchema.safeParse(events);
  if (!parsed.success) {
    throw new ServiceError(
      ErrorCode.Conflict,
      parsed.error.issues[0]?.message ?? "Diese Liste ist ungültig.",
    );
  }
  return parsed.data;
}

/** An archived event series is read-only, so nothing new can be attached to it (US-4). */
function requireOpen(series: EventSeries): void {
  if (series.isArchived) {
    throw new ServiceError(
      ErrorCode.Conflict,
      "Zu einer archivierten Eventreihe können keine Events hinzugefügt werden.",
    );
  }
}

/**
 * Rewrites the event list of one event series in a single transaction, so two teachers editing
 * the same series cannot lose one another's work. The document is re-read inside it and `change`
 * is applied to what it actually holds, never to the list the client was holding — so a stale
 * caller edits the list as it stands or fails, rather than overwriting what it never saw.
 */
async function writeEvents(
  eventSeriesId: string,
  change: (events: string[], series: EventSeries) => string[],
): Promise<void> {
  const reference = eventSeriesDoc(eventSeriesId);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
    }

    const series = eventSeriesSchema.parse({ id: eventSeriesId, ...snapshot.data() });
    transaction.update(reference, { events: storedEvents(change([...series.events], series)) });
  });
}

/** The stored spelling of one event, which is the text the registrations hold (US-11). */
async function readEvent(eventSeriesId: string, event: string): Promise<string> {
  const snapshot = await eventSeriesDoc(eventSeriesId).get();
  if (!snapshot.exists) {
    throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
  }

  const series = eventSeriesSchema.parse({ id: eventSeriesId, ...snapshot.data() });
  return series.events[requireIndex(series.events, event)]!;
}

/**
 * Every registration of this series assigned to `event` follows it — to a new name, or to
 * nothing at all. An assignment used to be a reference, so it survived a rename and had to be
 * cleared on a delete; now that it is the name itself, both are the same write (US-4, US-12).
 *
 * Only the event series is queried for. The event is compared here, so that reaching the
 * registrations of one series needs no index beyond the one Firestore keeps by itself.
 */
async function reassign(eventSeriesId: string, event: string, next: string | null): Promise<void> {
  const wanted = normalizeName(event);
  const found = await adminDb
    .collection(COLLECTIONS.registrations)
    .where("eventSeriesId", "==", eventSeriesId)
    .get();

  const operations: BatchOperation[] = found.docs
    .filter((record) => {
      const assigned = record.data()?.event;
      return typeof assigned === "string" && normalizeName(assigned) === wanted;
    })
    .map((record) => (batch) => batch.update(record.ref, { event: next }));

  await commitInChunks(operations);
}

export type EventItem = { eventSeriesId: string; name: string };

export async function createEvent(input: EventItem): Promise<EventItem> {
  const name = parseName(input.name);

  // A new event goes to the end of the teacher's order (see Ordering).
  await writeEvents(input.eventSeriesId, (events, series) => {
    requireOpen(series);
    if (indexOf(events, name) !== -1) throw duplicate(name);
    return [...events, name];
  });

  return { eventSeriesId: input.eventSeriesId, name };
}

/** Ordering is per event series, so one series' list can never renumber another's (see Ordering). */
export async function reorderEvents(
  eventSeriesId: string,
  orderedNames: readonly string[],
): Promise<void> {
  await writeEvents(eventSeriesId, (events) => {
    // A permutation and nothing else: an order naming an event that has since gone, or leaving
    // one out, would silently drop it — so it is refused and the list is left as it stands.
    if (orderedNames.length !== events.length) {
      throw new ServiceError(ErrorCode.Conflict, "Diese Reihenfolge passt nicht zur Liste.");
    }
    return orderedNames.map((name) => events[requireIndex(events, name)]!);
  });
}

/**
 * Only the name is editable — an event never moves between event series (US-4). The students
 * assigned to it are rewritten first, so a run that fails midway leaves them naming an event
 * that still exists rather than one that never did.
 */
export async function updateEvent(
  eventSeriesId: string,
  event: string,
  update: { name: string },
): Promise<EventItem> {
  const name = parseName(update.name);
  const current = await readEvent(eventSeriesId, event);

  if (normalizeName(current) !== normalizeName(name)) {
    await reassign(eventSeriesId, current, name);
  }

  await writeEvents(eventSeriesId, (events) => {
    const index = requireIndex(events, event);
    const clash = indexOf(events, name);
    if (clash !== -1 && clash !== index) throw duplicate(name);

    return events.map((stored, at) => (at === index ? name : stored));
  });

  return { eventSeriesId, name };
}

/**
 * Unassigning happens before the event leaves the list, so a failed run leaves records naming an
 * event that still exists rather than one that is gone (US-4, US-12).
 */
export async function deleteEvent(eventSeriesId: string, event: string): Promise<void> {
  const current = await readEvent(eventSeriesId, event);
  await reassign(eventSeriesId, current, null);

  await writeEvents(eventSeriesId, (events) =>
    events.filter((_, at) => at !== requireIndex(events, event)),
  );
}
