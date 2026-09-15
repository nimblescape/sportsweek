/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { normalizeName } from "@/lib/firebase/name-key";
import type { EventSeries } from "@/lib/schemas/event-series";
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import {
  MASTER_DATA_CATEGORIES,
  PER_EVENT_CATEGORY_KEYS,
  questionsAsked,
  type AnswerField,
  type EventSeriesListField,
  type MasterDataCategory,
} from "./categories";

type Lists = Pick<EventSeries, EventSeriesListField>;

/** The answers an event can supply differently from its series, and so the ones step two asks. */
export const EVENT_OWNED_ANSWERS: ReadonlySet<AnswerField> = new Set(
  PER_EVENT_CATEGORY_KEYS.map((key) => MASTER_DATA_CATEGORIES[key].usage.field),
);

function named(entry: string | { name: string }): string {
  return typeof entry === "string" ? entry : entry.name;
}

/**
 * What one event of this series actually offers (US-33, US-35): its own entries for a category it
 * names any of, the series' otherwise. The one function every caller asks — the form, the
 * completeness check, the report, the filter and the server-side validation of a saved answer —
 * so none of them can come to resolve a student's event differently from another.
 */
export function resolveEventLists(eventSeries: Lists, eventName: string | null): Lists {
  const wanted = eventName === null ? null : normalizeName(eventName);
  const event = eventSeries.events.find((candidate) => normalizeName(candidate.name) === wanted);

  const overridden = Object.fromEntries(
    PER_EVENT_CATEGORY_KEYS.map((key) => {
      const field = MASTER_DATA_CATEGORIES[key].field;
      const own = event?.[field] ?? [];
      return [field, own.length > 0 ? own : eventSeries[field]];
    }),
  );

  return { ...eventSeries, ...overridden } as Lists;
}

/**
 * Every value a category could ever answer with in this series (US-33): the series' own entries,
 * widened by whatever any of its events name instead of them. Answers a question the per-event
 * resolution above cannot — not "what does this student's event offer" but "what could any
 * student's event offer" — which is what a report field or a filter category has to know before
 * it can decide whether to show itself at all, and a saved filter has to know before it can tell
 * a value still on offer from one that is not.
 */
export function seriesWideLists(eventSeries: Lists): Lists {
  const widened = Object.fromEntries(
    PER_EVENT_CATEGORY_KEYS.map((key) => {
      const field = MASTER_DATA_CATEGORIES[key].field;
      const seriesOwn = eventSeries[field] as readonly (string | { name: string })[];
      const fromEvents = eventSeries.events.flatMap(
        (event) => event[field] as readonly (string | { name: string })[],
      );
      // One entry per name, first spelling kept: the series and an event may name the same thing,
      // and a filter offering it twice would be two tags for one answer.
      const seen = new Set<string>();
      const combined = [...seriesOwn, ...fromEvents].filter((entry) => {
        const key = normalizeName(named(entry));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [field, combined];
    }),
  );

  return { ...eventSeries, ...widened } as Lists;
}

/**
 * Whether this series registers in two steps (US-36): any event names any list of its own.
 *
 * Deliberately not "names programs of its own". An event with its own access cards would ask a
 * student for one before anybody knows which event they are in, and their answer would then turn
 * out not to be one their event offers — which is exactly what two steps exist to prevent.
 */
export function registersInTwoSteps(eventSeries: Lists): boolean {
  return eventSeries.events.some((event) =>
    PER_EVENT_CATEGORY_KEYS.some((key) => event[MASTER_DATA_CATEGORIES[key].field].length > 0),
  );
}

/**
 * Which of this student's answers came from lists their own event names rather than the series'
 * (US-33). An answer sourced from an event is only valid inside it, so moving the student or
 * taking their event away would leave it pointing at a list they are no longer offered — which is
 * what the assignment refuses on.
 *
 * Bounded by where the answer came from, not by what it is: an answer the series supplied
 * survives any move, and a question the event owns but the student has not reached yet has
 * nothing to invalidate.
 */
export function answersOwnedByEvent(
  eventSeries: Lists,
  eventName: string,
  answers: Partial<Record<AnswerField, unknown>>,
): AnswerField[] {
  const wanted = normalizeName(eventName);
  const event = eventSeries.events.find((candidate) => normalizeName(candidate.name) === wanted);
  if (event === undefined) return [];

  return PER_EVENT_CATEGORY_KEYS.filter(
    (key) => event[MASTER_DATA_CATEGORIES[key].field].length > 0,
  )
    .map((key) => MASTER_DATA_CATEGORIES[key].usage.field)
    .filter((field) => answers[field] !== null && answers[field] !== undefined);
}

/**
 * Whether a category's list, resolved for one event or the series at large, still names this
 * answer (US-9, US-21, US-33). The one comparison the student's own save and an assignment
 * moving them both need, so a value good enough for one cannot come to be too strict for the
 * other.
 */
export function isAnswerOffered(
  lists: Lists,
  category: MasterDataCategory,
  answer: unknown,
): boolean {
  if (typeof answer !== "string" || answer === "") return true;

  const offered = lists[category.field].map(named);
  // The free-text choice is never a row a teacher keeps, but it is offered alongside a
  // non-empty list, so it is a legitimate answer wherever the question is asked.
  const permitted =
    category.usage.field === "foodOption" && offered.length > 0
      ? [...offered, FOOD_OPTION_OTHER]
      : offered;

  return permitted.includes(answer);
}

/**
 * Which of this student's answers the event they are being assigned to does not offer (US-33,
 * US-36) — a one-step answer chosen against the series' own lists before this event kept any of
 * its own, or one a teacher has since narrowed an event's list away from. What an assignment
 * clears rather than carries forward, since writing it into an event it was never checked
 * against would leave the record naming something nothing offers.
 *
 * Bounded to what the event actually asks, the same as a save is (US-21): an empty list is a
 * question nobody puts, so an unrelated answer sitting in a field nothing has ever asked about is
 * not this function's to clear.
 */
export function answersNotOfferedByEvent(
  eventSeries: Lists,
  eventName: string,
  answers: Partial<Record<AnswerField, unknown>>,
): AnswerField[] {
  const lists = resolveEventLists(eventSeries, eventName);
  const asked = questionsAsked(lists);

  return PER_EVENT_CATEGORY_KEYS.filter((key) => {
    const category = MASTER_DATA_CATEGORIES[key];
    return (
      asked.has(category.usage.field) &&
      !isAnswerOffered(lists, category, answers[category.usage.field])
    );
  }).map((key) => MASTER_DATA_CATEGORIES[key].usage.field);
}

/**
 * What this student is asked (US-35, US-36): the questions the lists their event resolves to
 * stand behind — less, until they have an event in a two-step series, everything an event could
 * answer differently. The one function the form, the completeness check and the server all ask,
 * so none of them can come to put a question another one is not expecting an answer to.
 */
export function questionsFor(
  eventSeries: Lists,
  eventName: string | null,
): ReadonlySet<AnswerField> {
  const asked = questionsAsked(resolveEventLists(eventSeries, eventName));
  if (eventName !== null || !registersInTwoSteps(eventSeries)) return asked;

  return new Set([...asked].filter((field) => !EVENT_OWNED_ANSWERS.has(field)));
}
