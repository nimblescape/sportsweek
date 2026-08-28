/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeToDocument } from "@/lib/firebase/live-query";
import { registrationSchema, type Registration } from "@/lib/schemas/registration";
import type { EventSeries } from "@/lib/schemas/event-series";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import { registrationPath } from "./registration";

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
 * The document is read by its own id rather than found by a query: it lives beneath the series
 * it belongs to and is named after the student, so both halves of "which one is mine?" are
 * known before the read (US-26). That is also what lets a student read one that does not exist
 * yet — where every student starts — since the rule owns them by the document's name rather
 * than by a field only an existing document would have.
 */
export function useRegistration(studentUpn: string): RegistrationState {
  const { eventSeries, loading: eventSeriesLoading, error: eventSeriesError } = useEventSeries();
  // Undefined while the read is still outstanding, which is what null cannot say: null is the
  // answer for a student who has not registered yet.
  const [record, setRecord] = useState<Registration | null | undefined>(undefined);
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

  useEffect(() => {
    if (eventSeriesId === null) return;
    const path = registrationPath(eventSeriesId);

    return subscribeToDocument<Registration>({
      label: `${path}/${studentUpn}`,
      buildReference: () => doc(db, path, studentUpn),
      parse: (id, data) => {
        const parsed = registrationSchema.safeParse({ id, ...data });
        if (!parsed.success) {
          console.error(`${path}/${id} does not match the schema`, parsed.error);
          return null;
        }
        return parsed.data;
      },
      onData: setRecord,
      onError: setRecordError,
    });
  }, [eventSeriesId, studentUpn]);

  return {
    eventSeries: active.eventSeries,
    record: record ?? null,
    loading: eventSeriesLoading || (eventSeriesId !== null && record === undefined),
    error: eventSeriesError ?? active.error ?? recordError,
  };
}
