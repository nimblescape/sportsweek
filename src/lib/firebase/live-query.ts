/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
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

type DocumentParams<T> = {
  /** Names the document in console diagnostics. */
  label: string;
  buildReference: () => DocumentReference;
  /** Returns null for a document that fails its schema, so half of one is never shown. */
  parse: (id: string, data: DocumentData) => T | null;
  onData: (item: T | null) => void;
  onError: (message: string | null) => void;
};

type Recovery<S> = {
  label: string;
  subscribe: (onNext: (snapshot: S) => void, onFailure: (error: Error) => void) => () => void;
  deliver: (snapshot: S) => void;
  /** What a signed-out visitor is told, since there is nothing they may read. */
  onSignedOut: () => void;
  onError: (message: string | null) => void;
};

/**
 * The two things a bare `onSnapshot` does not survive, in one place for both shapes of read.
 *
 * Firestore tears a listener down for good when it errors — a single permission denial
 * during a rules deploy or a token refresh leaves the UI stale until a full page reload,
 * which looks exactly like "writes succeed but the list never changes". So failures are
 * retried here instead of being terminal.
 *
 * It also waits for Firebase Auth before reading: subscribing while the SDK is still
 * restoring the session from IndexedDB produces an unauthenticated read, and that failure
 * is what kills the listener in the first place.
 */
function withRecovery<S>({
  label,
  subscribe,
  deliver,
  onSignedOut,
  onError,
}: Recovery<S>): () => void {
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

  function start() {
    if (stopped) return;

    unsubscribeSnapshot = subscribe(
      (snapshot) => {
        if (stopped) return;
        deliver(snapshot);
        onError(null);
      },
      (error) => {
        if (stopped) return;
        console.error(`Failed to read ${label}:`, error);
        onError(error.message);

        unsubscribeSnapshot = null;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          start();
        }, RESUBSCRIBE_DELAY_MS);
      },
    );
  }

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (stopped) return;
    dropSubscription();

    if (!user) {
      onSignedOut();
      return;
    }

    start();
  });

  return () => {
    stopped = true;
    dropSubscription();
    unsubscribeAuth();
  };
}

/** A real-time query, retried past the failures that would otherwise end it for good. */
export function subscribeWithRecovery<T>({
  label,
  buildQuery,
  parse,
  onData,
  onError,
}: Params<T>): () => void {
  return withRecovery<QuerySnapshot>({
    label,
    subscribe: (onNext, onFailure) => onSnapshot(buildQuery(), onNext, onFailure),
    deliver: (snapshot) =>
      onData(
        snapshot.docs.flatMap((document) => {
          const parsed = parse(document.id, document.data());
          return parsed === null ? [] : [parsed];
        }),
      ),
    onSignedOut: () => onData([]),
    onError,
  });
}

/**
 * The same, for a document read by its own id rather than found by a query. A document that
 * does not exist reads as null: it is a legitimate answer wherever the id is derived rather
 * than discovered, and the reader has to tell it apart from not having read yet.
 */
export function subscribeToDocument<T>({
  label,
  buildReference,
  parse,
  onData,
  onError,
}: DocumentParams<T>): () => void {
  return withRecovery<DocumentSnapshot>({
    label,
    subscribe: (onNext, onFailure) => onSnapshot(buildReference(), onNext, onFailure),
    deliver: (snapshot) => {
      const data = snapshot.data();
      onData(data === undefined ? null : parse(snapshot.id, data));
    },
    onSignedOut: () => onData(null),
    onError,
  });
}
