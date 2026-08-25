/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { FirebaseApp } from "firebase/app";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

/**
 * Firestore streams real-time updates over WebChannel, a single long-lived connection.
 * Mobile hotspots, school proxies and corporate firewalls routinely cut connections that
 * stay open, and the failure is silent: the SDK logs `RPC 'Listen' stream transport errored`
 * but never calls the `onSnapshot` error handler, so a list keeps rendering stale data while
 * looking perfectly healthy.
 *
 * `experimentalAutoDetectLongPolling` is already the SDK default, but it only probes during
 * the initial handshake — it cannot help when the connection is established and killed later.
 * Long polling uses short-lived requests instead, which those networks leave alone. The cost
 * is a little extra request overhead, which is a good trade for updates that always arrive.
 */
export function createFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    // Already initialized — happens on a hot reload, where the settings are still in force.
    return getFirestore(app);
  }
}
