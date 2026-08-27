/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useSyncExternalStore } from "react";

/**
 * Asks the device whether it can hover, rather than asking the user agent what it is called:
 * a control revealed on hover is unreachable on a touch screen (see General), and the string a
 * browser reports about itself has never been a reliable answer to that.
 */
const HOVER_QUERY = "(hover: hover)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Rendered on the server as "cannot hover", so a control is never hidden behind a gesture. */
export function useHoverCapability(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false,
  );
}
