/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { registrationSchema, type Registration } from "@/lib/schemas/registration";
import type { EventSeries } from "@/lib/schemas/event-series";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";

type RegistrationState = {
  /** The event series the student registers for, or null while a teacher has activated none (US-4). */
  eventSeries: EventSeries | null;
  /** Null until the student has saved once — an event series without a record is the normal start. */
  record: Registration | null;
  loading: boolean;
  error: string | null;
};

/**
 * The student's own registration, read live through the client SDK (see firestore.rules).
 *
 * A query rather than a read of the derived id, even though the id is known: rules deny a read
 * of a document that does not exist, because there is no `resource` to check ownership against
 * — and not having registered yet is where every student starts. A query is evaluated per
 * document returned, so the same rule answers "none of them" instead of "no permission".
 */
export function useRegistration(userId: string): RegistrationState {
  const { eventSeries, loading: eventSeriesLoading, error: eventSeriesError } = useEventSeries();
  const [records, setRecords] = useState<Registration[] | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Two active event series is a data defect the student cannot act on, so it is reported rather
  // than thrown — a throw here would take the page down with it.
  const active = useMemo(() => {
    try {
      return { eventSeries: activeEventSeriesOf(eventSeries), error: null };
    } catch (caught) {
      return {
        eventSeries: null,
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
  }, [eventSeries]);

  const eventSeriesId = active.eventSeries?.id ?? null;

  useEffect(
    () =>
      subscribeWithRecovery<Registration>({
        label: COLLECTIONS.registrations,
        buildQuery: () =>
          query(collection(db, COLLECTIONS.registrations), where("userId", "==", userId)),
        parse: (id, data) => {
          const parsed = registrationSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(
              `${COLLECTIONS.registrations}/${id} does not match the schema`,
              parsed.error,
            );
            return null;
          }
          return parsed.data;
        },
        onData: setRecords,
        onError: setRecordError,
      }),
    [userId],
  );

  return {
    eventSeries: active.eventSeries,
    // A student keeps one record per event series they have registered for; this is the current one.
    record: records?.find((candidate) => candidate.eventSeriesId === eventSeriesId) ?? null,
    loading: eventSeriesLoading || records === null,
    error: eventSeriesError ?? active.error ?? recordError,
  };
}
