/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { CrudList, type CrudItem } from "@/components/master-data/crud-list";
import { apiRequest } from "@/lib/api/client";
import {
  categoryOf,
  CHILD_IN_USE_HINT,
  type MasterDataCategoryKey,
} from "@/lib/master-data/categories";
import { categoryTabs, eventSeriesTrail } from "@/lib/master-data/hierarchy";
import { useMasterData, useUsageReport } from "@/lib/master-data/use-master-data";
import { useSelectedEventSeries } from "@/lib/event-series/use-selected-event-series";
import { FOOD_OPTION_OTHER_LABEL } from "@/lib/schemas/master-data";
import { IRREVERSIBLE_HINT } from "@/lib/ui/hints";

const FOOD_OPTION_OTHER_HINT =
  "Diese Option steht immer zur Verfügung und kann nicht bearbeitet oder gelöscht werden. " +
  "Wer sie wählt, muss die Unverträglichkeit angeben.";

/** Offered to students without anybody maintaining it, so the list shows it locked (US-9). */
const FIXED_ITEMS: Partial<
  Record<MasterDataCategoryKey, { items: readonly string[]; hint: string }>
> = {
  "food-options": { items: [FOOD_OPTION_OTHER_LABEL], hint: FOOD_OPTION_OTHER_HINT },
};

type MasterDataViewProps = {
  category: MasterDataCategoryKey;
  eventSeriesId: string;
  /** Where an entry's own record page is, for a category whose entries have children (US-33). */
  openHref?: (item: CrudItem) => string;
};

/** One category of one event series, as a record screen of the master data hierarchy (US-33). */
export function MasterDataView({ category: key, eventSeriesId, openHref }: MasterDataViewProps) {
  const category = categoryOf(key);
  const { items, loading, error } = useMasterData(key, eventSeriesId);
  const report = useUsageReport(key, eventSeriesId);
  // The screen is about the series, so its name is the title and the last step of the path.
  const { eventSeries } = useSelectedEventSeries(eventSeriesId);
  const name = eventSeries?.name ?? "";
  const fixed = FIXED_ITEMS[key];
  // Every list belongs to one event series (US-21), so the write names the one it edits.
  const endpoint = `/api/event-series/${encodeURIComponent(eventSeriesId)}/master-data/${key}`;

  return (
    <CrudList
      trail={eventSeriesTrail(eventSeriesId, name)}
      tabs={categoryTabs(eventSeriesId)}
      marked={key}
      labels={category.labels}
      items={items.map((name) => ({ id: name, name }))}
      loading={loading}
      error={error}
      blockedIds={report.blockedNames}
      usagePending={report.loading}
      undeletableIds={new Set(Object.keys(report.blockedEquipment))}
      undeletableHint={CHILD_IN_USE_HINT}
      fixedItems={fixed?.items}
      fixedItemsHint={fixed?.hint}
      openHref={openHref}
      onSubmit={(name, item) =>
        item === null
          ? apiRequest(endpoint, { method: "POST", body: { name } }).then(() => {})
          : apiRequest(endpoint, {
              method: "PATCH",
              body: { item: item.name, name },
            }).then(() => {})
      }
      onDelete={(item) =>
        apiRequest(endpoint, {
          method: "DELETE",
          body: { item: item.name },
        }).then(() => {})
      }
      onReorder={(order) =>
        apiRequest(endpoint, { method: "PATCH", body: { order } }).then(() => {})
      }
      deleteNote={(item) => (
        <>
          <strong>{item.name}</strong> wird aus der Liste entfernt. {IRREVERSIBLE_HINT}
        </>
      )}
      editNote={(item) => (
        <>
          <strong>{item.name}</strong> wird umbenannt.
        </>
      )}
    />
  );
}
