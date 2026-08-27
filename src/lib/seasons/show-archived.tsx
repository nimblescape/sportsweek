/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";

type ShowArchived = { showArchived: boolean; setShowArchived: (next: boolean) => void };

const ShowArchivedContext = React.createContext<ShowArchived | null>(null);

/**
 * Whether the season list is showing archived seasons.
 *
 * It lives above both pages rather than in the list, because stepping into a season's events and
 * coming back is one errand: a teacher who revealed the archive to reach an old season should not
 * have to reveal it again on the way back. Mounted on the seasons segment, which is the narrowest
 * place the two pages share.
 */
export function ShowArchivedProvider({ children }: { children: React.ReactNode }) {
  const [showArchived, setShowArchived] = React.useState(false);
  const value = React.useMemo(() => ({ showArchived, setShowArchived }), [showArchived]);

  return <ShowArchivedContext.Provider value={value}>{children}</ShowArchivedContext.Provider>;
}

export function useShowArchived(): ShowArchived {
  const shared = React.useContext(ShowArchivedContext);
  const [showArchived, setShowArchived] = React.useState(false);

  // Without the provider the toggle still works; it just does not survive a navigation.
  return shared ?? { showArchived, setShowArchived };
}
