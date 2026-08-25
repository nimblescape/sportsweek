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
import { useMasterData, useUsageReport } from "@/lib/master-data/use-master-data";

type MasterDataViewProps = {
  category: MasterDataCategoryKey;
  /** Options offered to students that the teacher does not maintain, such as "Sonstiges" (US-9). */
  fixedItems?: readonly string[];
  fixedItemsHint?: string;
  renderRowAction?: (item: CrudItem) => React.ReactNode;
};

/** A teacher-maintained collection on the shared CRUD list (US-5 to US-10). */
export function MasterDataView({
  category: key,
  fixedItems,
  fixedItemsHint,
  renderRowAction,
}: MasterDataViewProps) {
  const category = categoryOf(key);
  const { items, loading, error } = useMasterData(key);
  const report = useUsageReport(key);

  return (
    <CrudList
      labels={category.labels}
      items={items}
      loading={loading}
      error={error}
      blockedIds={report.blockedIds}
      undeletableIds={new Set(Object.keys(report.blockedEquipment))}
      undeletableHint={CHILD_IN_USE_HINT}
      fixedItems={fixedItems}
      fixedItemsHint={fixedItemsHint}
      renderRowAction={renderRowAction}
      onSubmit={(name, item) =>
        item === null
          ? apiRequest(`/api/master-data/${key}`, { method: "POST", body: { name } }).then(() => {})
          : apiRequest(`/api/master-data/${key}/${item.id}`, {
              method: "PATCH",
              body: { name },
            }).then(() => {})
      }
      onDelete={(item) =>
        apiRequest(`/api/master-data/${key}/${item.id}`, { method: "DELETE" }).then(() => {})
      }
      onReorder={(order) => {
        void apiRequest(`/api/master-data/${key}`, { method: "PATCH", body: { order } });
      }}
      deleteNote={(item) => (
        <>
          <strong>{item.name}</strong> wird aus der Liste entfernt. Bereits gespeicherte
          Schülerdaten bleiben unverändert.
        </>
      )}
    />
  );
}
