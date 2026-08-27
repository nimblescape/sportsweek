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
import { userSchema, type User } from "@/lib/schemas/user";
import { joinRoster, type RosterStudent } from "./roster";

type RosterState = {
  students: RosterStudent[];
  loading: boolean;
  error: string | null;
};

/**
 * Every registration of one event series, with the names to show them under (US-12, US-13).
 *
 * A live read rather than a handler: a teacher may read the collection outright (see
 * firestore.rules), and it is the subscription that makes the overview tables follow an
 * assignment the moment it is stored.
 */
export function useRoster(eventSeriesId: string | null): RosterState {
  const [records, setRecords] = useState<Registration[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    if (eventSeriesId === null) return;

    return subscribeWithRecovery<Registration>({
      label: COLLECTIONS.registrations,
      buildQuery: () =>
        query(
          collection(db, COLLECTIONS.registrations),
          where("eventSeriesId", "==", eventSeriesId),
        ),
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
    });
  }, [eventSeriesId]);

  // Only the students: a teacher keeps no registration of their own (US-15), so their record
  // could never be joined to one.
  useEffect(
    () =>
      subscribeWithRecovery<User>({
        label: COLLECTIONS.users,
        buildQuery: () => query(collection(db, COLLECTIONS.users), where("role", "==", "student")),
        parse: (id, data) => {
          const parsed = userSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(`${COLLECTIONS.users}/${id} does not match the schema`, parsed.error);
            return null;
          }
          return parsed.data;
        },
        onData: setUsers,
        onError: setUserError,
      }),
    [],
  );

  const students = useMemo(
    () => (records === null || users === null ? [] : joinRoster(records, users)),
    [records, users],
  );

  return {
    students,
    loading: eventSeriesId !== null && (records === null || users === null),
    error: recordError ?? userError,
  };
}
