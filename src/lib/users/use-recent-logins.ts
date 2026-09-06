/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { formatLoginTime, LOGIN_TIME_FIELD } from "@/lib/auth/login-time";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { Teacher } from "./use-teachers";

/** Enough to answer "recently, or never" — not a pattern, so one is enough. */
const SHOWN_LOGINS = 1;

/**
 * The last sign-in of the teachers shown, read once rather than subscribed to (US-47): a
 * sign-in elsewhere does not redraw a page whose whole subject is permissions.
 *
 * A teacher is absent from the map until their read settles, and stays absent if it is refused
 * -- the line this is shown in is an aside, so its failure must never take the rest of a card
 * down with it. A teacher who has genuinely never signed in is present with an empty array,
 * which is a different, tellable fact from "not read yet".
 */
export function useRecentLogins(
  teachers: readonly Teacher[],
): ReadonlyMap<string, readonly string[]> {
  const [logins, setLogins] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const unseen = teachers.filter((teacher) => !requested.current.has(teacher.uid));
    if (unseen.length === 0) return;

    for (const teacher of unseen) {
      requested.current.add(teacher.uid);

      getDocs(
        query(
          collection(db, COLLECTIONS.users, teacher.uid, COLLECTIONS.logins),
          orderBy(LOGIN_TIME_FIELD, "desc"),
          limit(SHOWN_LOGINS),
        ),
      )
        .then((snapshot) => {
          const history = snapshot.docs.map((login) =>
            formatLoginTime(String(login.get(LOGIN_TIME_FIELD))),
          );
          setLogins((current) => new Map(current).set(teacher.uid, history));
        })
        .catch((error: unknown) => {
          console.error(`Failed to read the sign-ins of ${teacher.uid}:`, error);
        });
    }
  }, [teachers]);

  return logins;
}
