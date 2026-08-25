/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, type DocumentData, type Query } from "firebase/firestore";
import { auth } from "@/lib/firebase/client";

/** Long enough not to hammer Firestore while a rules deploy or a token refresh settles. */
export const RESUBSCRIBE_DELAY_MS = 2000;

type Params<T> = {
  /** Names the collection in console diagnostics. */
  label: string;
  buildQuery: () => Query;
  /** Returns null for a document that fails its schema, so one bad row cannot hide the rest. */
  parse: (id: string, data: DocumentData) => T | null;
  onData: (items: T[]) => void;
  onError: (message: string | null) => void;
};

/**
 * A real-time subscription that survives the two things a bare `onSnapshot` does not.
 *
 * Firestore tears a listener down for good when it errors — a single permission denial
 * during a rules deploy or a token refresh leaves the UI stale until a full page reload,
 * which looks exactly like "writes succeed but the list never changes". So failures are
 * retried here instead of being terminal.
 *
 * It also waits for Firebase Auth before querying: subscribing while the SDK is still
 * restoring the session from IndexedDB produces an unauthenticated read, and that failure
 * is what kills the listener in the first place.
 */
export function subscribeWithRecovery<T>({
  label,
  buildQuery,
  parse,
  onData,
  onError,
}: Params<T>): () => void {
  let unsubscribeSnapshot: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function dropSubscription() {
    unsubscribeSnapshot?.();
    unsubscribeSnapshot = null;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function subscribe() {
    if (stopped) return;

    unsubscribeSnapshot = onSnapshot(
      buildQuery(),
      (snapshot) => {
        if (stopped) return;
        onData(
          snapshot.docs.flatMap((document) => {
            const parsed = parse(document.id, document.data());
            return parsed === null ? [] : [parsed];
          }),
        );
        onError(null);
      },
      (error) => {
        if (stopped) return;
        console.error(`Failed to read ${label}:`, error);
        onError(error.message);

        unsubscribeSnapshot = null;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          subscribe();
        }, RESUBSCRIBE_DELAY_MS);
      },
    );
  }

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (stopped) return;
    dropSubscription();

    if (!user) {
      onData([]);
      return;
    }

    subscribe();
  });

  return () => {
    stopped = true;
    dropSubscription();
    unsubscribeAuth();
  };
}
