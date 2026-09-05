/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { MasterDataView } from "@/components/master-data/master-data-view";
import { eventRecordPath } from "@/lib/master-data/hierarchy";

/**
 * The events list, whose entries now have a record page of their own: the five lists an event
 * may override in place of the series' (US-33). An event is opened by its name, as every other
 * record is.
 */
export function EventsView({ eventSeriesId }: { eventSeriesId: string }) {
  return (
    <MasterDataView
      category="events"
      eventSeriesId={eventSeriesId}
      openHref={(event) => eventRecordPath(eventSeriesId, event.name)}
    />
  );
}
