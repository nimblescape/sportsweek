/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";
import { classTeachersPath } from "@/lib/master-data/hierarchy";

/**
 * The classes list, whose entries have a record page of their own: the teachers assigned to a
 * class (US-38). A class is opened by its name, as every other record is.
 */
export function ClassesView({ eventSeriesId }: { eventSeriesId: string }) {
  return (
    <MasterDataView
      category="classes"
      eventSeriesId={eventSeriesId}
      openHref={(item) => classTeachersPath(eventSeriesId, item.name)}
    />
  );
}
