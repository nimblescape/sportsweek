/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { registrationPath } from "@/lib/registration/registration";
import { registrationSchema, type Registration } from "@/lib/schemas/registration";
import { toRoster, type RosterStudent } from "./roster";

type RosterState = {
  students: RosterStudent[];
  loading: boolean;
  error: string | null;
};

/**
 * Every registration of one event series, with the names to show them under (US-12, US-13).
 *
 * A live read rather than a handler: a teacher may read the subcollection outright (see
 * firestore.rules), and it is the subscription that makes the overview tables follow an
 * assignment the moment it is stored. One subscription and no join — the registration carries
 * the student's name itself (US-26).
 */
export function useRoster(eventSeriesId: string | null): RosterState {
  const [records, setRecords] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventSeriesId === null) return;
    const path = registrationPath(eventSeriesId);

    return subscribeWithRecovery<Registration>({
      label: path,
      buildQuery: () => query(collection(db, path)),
      parse: (id, data) => {
        const parsed = registrationSchema.safeParse({ id, ...data });
        if (!parsed.success) {
          console.error(`${path}/${id} does not match the schema`, parsed.error);
          return null;
        }
        return parsed.data;
      },
      onData: setRecords,
      onError: setError,
    });
  }, [eventSeriesId]);

  const students = useMemo(() => (records === null ? [] : toRoster(records)), [records]);

  return {
    students,
    loading: eventSeriesId !== null && records === null,
    error,
  };
}
