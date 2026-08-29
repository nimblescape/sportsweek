/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { requestsInFlight, subscribeToRequests } from "@/lib/api/requests";

type BusyValue = { busy: boolean; hold: () => () => void };

const BusyContext = React.createContext<BusyValue | null>(null);

/** Without a provider a write still runs; it just has no spinner to report to. */
const NO_HOLD = () => () => {};

/**
 * One place that knows whether anything is being written, so one spinner can speak for all of
 * it. A count rather than a flag: two writes may overlap, and the first to finish must not
 * declare the app idle while the second is still out.
 *
 * Two sources, added together. Every request reports itself from inside `apiRequest`, which is
 * what makes the spinner structural rather than something each control has to remember; the
 * holds below are for a wait nobody is making a request for, such as a list still arriving from
 * its subscription.
 */
export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [holds, setHolds] = React.useState(0);
  const requests = React.useSyncExternalStore(subscribeToRequests, requestsInFlight, () => 0);

  const hold = React.useCallback(() => {
    setHolds((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds((count) => count - 1);
    };
  }, []);

  const value = React.useMemo(
    () => ({ busy: holds > 0 || requests > 0, hold }),
    [holds, requests, hold],
  );

  return <BusyContext.Provider value={value}>{children}</BusyContext.Provider>;
}

export function useBusy(): boolean {
  return React.useContext(BusyContext)?.busy ?? false;
}

/**
 * Whether a control is inert: because it was told to be, or because something is in flight.
 *
 * Asked by the controls themselves rather than by the views that place them, so a control cannot
 * be left live over data that is still arriving or already being written. A read counts as much
 * as a write — a list still loading is a list whose rows are not there to act on — and both
 * report themselves without a caller saying so.
 */
export function useInert(disabled?: boolean): boolean {
  return useBusy() || disabled === true;
}

/** Taken for the length of a write and released when it is answered, however it ends. */
export function useHold(): () => () => void {
  return React.useContext(BusyContext)?.hold ?? NO_HOLD;
}

/**
 * Reports a wait the caller does not run itself — a list still loading from its subscription.
 * The same spinner answers for it, so a view has none of its own to place.
 */
export function useBusyWhile(active: boolean): void {
  const hold = useHold();

  React.useEffect(() => {
    if (!active) return;
    return hold();
  }, [active, hold]);
}
