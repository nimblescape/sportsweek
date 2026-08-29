/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { ShowArchivedProvider } from "@/lib/event-series/show-archived";

/** Wraps the event series list and an event series' events, so walking between them keeps what was revealed. */
export default function EventSeriesLayout({ children }: { children: ReactNode }) {
  return <ShowArchivedProvider>{children}</ShowArchivedProvider>;
}
