/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";
import { equipmentPath, eventEquipmentPath } from "@/lib/master-data/hierarchy";

/**
 * The programs list, whose entries have a record page of their own: the equipment a program
 * requires (US-5, US-33) — the series' own list, or one of an event's own. A program is opened
 * by its name, as every other record is — and it stays reachable while the program itself is
 * locked, since its equipment is blocked separately.
 */
export function ProgramsView({
  eventSeriesId,
  eventName,
}: {
  eventSeriesId: string;
  /** Undefined for the series' own list; one of an event's own names itself instead (US-33). */
  eventName?: string;
}) {
  return (
    <MasterDataView
      category="programs"
      eventSeriesId={eventSeriesId}
      eventName={eventName}
      openHref={(program) =>
        eventName === undefined
          ? equipmentPath(eventSeriesId, program.name)
          : eventEquipmentPath(eventSeriesId, eventName, program.name)
      }
    />
  );
}
