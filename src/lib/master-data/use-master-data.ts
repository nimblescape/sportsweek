/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { byPosition } from "@/lib/schemas/position";
import {
  namedListItemSchema,
  programSchema,
  type NamedListItem,
  type Program,
} from "@/lib/schemas/master-data";
import { categoryOf, type MasterDataCategoryKey } from "./categories";

/** Real-time read straight from the client SDK, governed by Security Rules. */
export function useMasterData(key: MasterDataCategoryKey) {
  const [items, setItems] = useState<NamedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const category = categoryOf(key);

    return subscribeWithRecovery<NamedListItem>({
      label: category.collection,
      // Sorted here rather than in the query: Firestore's orderBy silently omits documents that
      // lack the field, which would hide any item stored before ordering existed.
      buildQuery: () => query(collection(db, category.collection)),
      parse: (id, data) => {
        const parsed = namedListItemSchema.safeParse({ id, ...data });
        if (!parsed.success) {
          console.error(`${category.collection}/${id} does not match the schema`, parsed.error);
          return null;
        }
        return parsed.data;
      },
      onData: (received) => {
        setItems([...received].sort(byPosition));
        setLoading(false);
      },
      onError: (message) => {
        setError(message);
        if (message !== null) setLoading(false);
      },
    });
  }, [key]);

  return { items, loading, error };
}

/** One program, including the equipment list it carries (US-5). */
export function useProgram(programId: string) {
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const category = categoryOf("programs");

    return onSnapshot(
      doc(db, category.collection, programId),
      (snapshot) => {
        const parsed = programSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
        if (!snapshot.exists() || !parsed.success) {
          setProgram(null);
        } else {
          setProgram(parsed.data);
        }
        setLoading(false);
        setError(null);
      },
      (caught) => {
        console.error(`Failed to read program ${programId}:`, caught);
        setError(caught.message);
        setLoading(false);
      },
    );
  }, [programId]);

  return { program, loading, error };
}

export type UsageReport = {
  blockedIds: Set<string>;
  /** Per item id, the entries of its equipment list a student still rents, spelled as stored. */
  blockedEquipment: Record<string, string[]>;
};

const NOTHING_BLOCKED: UsageReport = { blockedIds: new Set(), blockedEquipment: {} };

/**
 * What the in-use guard blocks (US-5 to US-10). The answer is derived from student master data,
 * which no client may read (see firestore.rules), so it comes from a teacher-guarded handler
 * rather than a subscription. Fetching once is enough: it only moves when a student edits their
 * master data, which cannot happen from this view.
 */
export function useUsageReport(key: MasterDataCategoryKey): UsageReport {
  const [report, setReport] = useState<UsageReport>(NOTHING_BLOCKED);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/master-data/${key}`);
        if (!response.ok) return;

        const body = await response.json();
        if (!active) return;

        setReport({
          blockedIds: new Set(Array.isArray(body?.blockedIds) ? body.blockedIds : []),
          blockedEquipment:
            body?.blockedEquipment && typeof body.blockedEquipment === "object"
              ? body.blockedEquipment
              : {},
        });
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

  return report;
}
