/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";
import { equipmentPath } from "@/lib/master-data/hierarchy";

/**
 * The programs list, whose entries have a record page of their own: the equipment a program
 * requires (US-5, US-33). A program is opened by its name, as every other record is — and it
 * stays reachable while the program itself is locked, since its equipment is blocked separately.
 */
export function ProgramsView({ eventSeriesId }: { eventSeriesId: string }) {
  return (
    <MasterDataView
      category="programs"
      eventSeriesId={eventSeriesId}
      openHref={(program) => equipmentPath(eventSeriesId, program.name)}
    />
  );
}
