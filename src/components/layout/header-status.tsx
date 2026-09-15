/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";

type HeaderStatusValue = {
  status: React.ReactNode;
  setStatus: (status: React.ReactNode) => void;
};

const HeaderStatusContext = React.createContext<HeaderStatusValue | null>(null);

/**
 * What the header shows about the page beneath it — set by that page, read by the shell, so the
 * shell stays ignorant of what any particular page is doing (US-11). Without a provider a page
 * setting one simply has nowhere to put it, which is why the setter is a no-op rather than a
 * thrown error: a component using the hook does not have to know whether it is under `AppShell`.
 */
export function HeaderStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<React.ReactNode>(null);
  const value = React.useMemo(() => ({ status, setStatus }), [status]);

  return <HeaderStatusContext.Provider value={value}>{children}</HeaderStatusContext.Provider>;
}

export function useHeaderStatus(): React.ReactNode {
  return React.useContext(HeaderStatusContext)?.status ?? null;
}

/** Reads the context so the shell around it does not have to be a client component itself. */
export function HeaderStatusSlot() {
  return useHeaderStatus();
}

/** Held only for as long as the caller stays mounted, and cleared on the way out. */
export function useSetHeaderStatus(status: React.ReactNode): void {
  const setStatus = React.useContext(HeaderStatusContext)?.setStatus;

  React.useEffect(() => {
    setStatus?.(status);
    return () => setStatus?.(null);
  }, [status, setStatus]);
}
