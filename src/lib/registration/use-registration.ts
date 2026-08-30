/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeToDocument } from "@/lib/firebase/live-query";
import { registrationSchema, type Registration } from "@/lib/schemas/registration";
import type { EventSeries } from "@/lib/schemas/event-series";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import { registrationPath } from "./registration";

type RegistrationState = {
  /** The series named by the path, or null while it is unknown — deleted, or never existing. */
  eventSeries: EventSeries | null;
  /** Null until the student has saved once — an event series without a record is the normal start. */
  record: Registration | null;
  loading: boolean;
  error: string | null;
};

/**
 * The student's own registration in one event series, read live through the client SDK (see
 * firestore.rules). Which series that is comes from the path rather than from a search: the page
 * has already decided it, from the link the student joined through or from the one open series
 * they hold (Q7), and deciding it a second time would be deciding it differently.
 *
 * The document is read by its own id rather than found by a query: it lives beneath the series
 * it belongs to and is named after the student, so both halves of "which one is mine?" are
 * known before the read (US-26). That is also what lets a student read one that does not exist
 * yet — where every student starts — since the rule owns them by the document's name rather
 * than by a field only an existing document would have.
 */
export function useRegistration(eventSeriesId: string, studentUid: string): RegistrationState {
  const { eventSeries, loading: eventSeriesLoading, error: eventSeriesError } = useEventSeries();
  // Undefined while the read is still outstanding, which is what null cannot say: null is the
  // answer for a student who has not registered yet.
  const [record, setRecord] = useState<Registration | null | undefined>(undefined);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    const path = registrationPath(eventSeriesId);

    return subscribeToDocument<Registration>({
      label: `${path}/${studentUid}`,
      buildReference: () => doc(db, path, studentUid),
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
  }, [eventSeriesId, studentUid]);

  return {
    eventSeries: eventSeries.find((one) => one.id === eventSeriesId) ?? null,
    record: record ?? null,
    loading: eventSeriesLoading || record === undefined,
    error: eventSeriesError ?? recordError,
  };
}
