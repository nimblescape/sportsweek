/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { namedListItemSchema, type NamedListItem } from "@/lib/schemas/master-data";
import { categoryOf, type MasterDataCategoryKey } from "./categories";

/** Real-time read straight from the client SDK, governed by Security Rules. */
export function useMasterData(key: MasterDataCategoryKey, parentId?: string) {
  const [items, setItems] = useState<NamedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const category = categoryOf(key);

    return subscribeWithRecovery<NamedListItem>({
      label: category.collection,
      buildQuery: () => {
        const items = collection(db, category.collection);
        return category.parentField === undefined
          ? query(items, orderBy("name"))
          : query(items, where(category.parentField, "==", parentId ?? ""), orderBy("name"));
      },
      parse: (id, data) => {
        const parsed = namedListItemSchema.safeParse({ id, ...data });
        if (!parsed.success) {
          console.error(`${category.collection}/${id} does not match the schema`, parsed.error);
          return null;
        }
        return parsed.data;
      },
      onData: (received) => {
        setItems(received);
        setLoading(false);
      },
      onError: (message) => {
        setError(message);
        if (message !== null) setLoading(false);
      },
    });
  }, [key, parentId]);

  return { items, loading, error };
}

/**
 * The items the in-use guard blocks (US-5 to US-10). The answer is derived from student master
 * data, which no client may read (see firestore.rules), so it comes from a teacher-guarded
 * handler rather than a subscription. Fetching once is enough: it only moves when a student
 * edits their master data, which cannot happen from this view.
 */
export function useBlockedItemIds(key: MasterDataCategoryKey) {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/master-data/${key}`);
        if (!response.ok) return;

        const body = await response.json();
        if (active && Array.isArray(body?.blockedIds)) setBlockedIds(new Set(body.blockedIds));
      } catch (error) {
        // A missing answer only costs the disabled state; the server re-checks on every write.
        console.error(`Failed to read ${key} usage:`, error);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [key]);

  return blockedIds;
}
