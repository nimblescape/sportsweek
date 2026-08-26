/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { studentMasterDataSchema, type StudentMasterData } from "@/lib/schemas/student-master-data";
import type { Season } from "@/lib/schemas/season";
import { activeSeasonOf } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";

type StudentMasterDataState = {
  /** The season the student registers for, or null while a teacher has activated none (US-4). */
  season: Season | null;
  /** Null until the student has saved once — a season without a record is the normal start. */
  record: StudentMasterData | null;
  loading: boolean;
  error: string | null;
};

/**
 * The student's own registration, read live through the client SDK (see firestore.rules).
 *
 * A query rather than a read of the derived id, even though the id is known: rules deny a read
 * of a document that does not exist, because there is no `resource` to check ownership against
 * — and not having registered yet is where every student starts. A query is evaluated per
 * document returned, so the same rule answers "none of them" instead of "no permission".
 */
export function useStudentMasterData(userId: string): StudentMasterDataState {
  const { seasons, loading: seasonsLoading, error: seasonsError } = useSeasons();
  const [records, setRecords] = useState<StudentMasterData[] | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Two active seasons is a data defect the student cannot act on, so it is reported rather
  // than thrown — a throw here would take the page down with it.
  const active = useMemo(() => {
    try {
      return { season: activeSeasonOf(seasons), error: null };
    } catch (caught) {
      return { season: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [seasons]);

  const seasonId = active.season?.id ?? null;

  useEffect(
    () =>
      subscribeWithRecovery<StudentMasterData>({
        label: COLLECTIONS.studentMasterData,
        buildQuery: () =>
          query(collection(db, COLLECTIONS.studentMasterData), where("userId", "==", userId)),
        parse: (id, data) => {
          const parsed = studentMasterDataSchema.safeParse({ id, ...data });
          if (!parsed.success) {
            console.error(
              `${COLLECTIONS.studentMasterData}/${id} does not match the schema`,
              parsed.error,
            );
            return null;
          }
          return parsed.data;
        },
        onData: setRecords,
        onError: setRecordError,
      }),
    [userId],
  );

  return {
    season: active.season,
    // A student keeps one record per season they have registered for; this is the current one.
    record: records?.find((candidate) => candidate.seasonId === seasonId) ?? null,
    loading: seasonsLoading || records === null,
    error: seasonsError ?? active.error ?? recordError,
  };
}
