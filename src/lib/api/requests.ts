/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * How many requests are out, counted where they are made rather than where they are asked for.
 *
 * A module-level count rather than React state, because it is taken inside `apiRequest` — the one
 * function every write in the application goes through. That is what makes reporting a write
 * structural: a caller cannot forget to say it is writing, because saying so is not the caller's
 * to do. A dialog that owned its own `saving` flag and never reached the spinner is the failure
 * this rules out.
 *
 * A count rather than a flag: two writes may overlap, and the first to be answered must not
 * declare the application idle while the second is still out.
 */
let inFlight = 0;

const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

/** Taken for the length of one request and released when it is answered, however it ends. */
export function holdRequest(): () => void {
  inFlight += 1;
  announce();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight -= 1;
    announce();
  };
}

export function requestsInFlight(): number {
  return inFlight;
}

export function subscribeToRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
