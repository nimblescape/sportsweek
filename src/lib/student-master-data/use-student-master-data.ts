/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { studentMasterDataSchema, type StudentMasterData } from "@/lib/schemas/student-master-data";
import type { Season } from "@/lib/schemas/season";
import { activeSeasonOf } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";
import { recordIdFor } from "./registration";

type StudentMasterDataState = {
  /** The season the student registers for, or null while a teacher has activated none (US-4). */
  season: Season | null;
  /** Null until the student has saved once — a season without a record is the normal start. */
  record: StudentMasterData | null;
  loading: boolean;
  error: string | null;
};

/**
 * The student's own registration, read live through the client SDK (see firestore.rules). The
 * record's id is derived from the season and the student rather than searched for, so this is a
 * single-document read no index has to support.
 */
export function useStudentMasterData(userId: string): StudentMasterDataState {
  const { seasons, loading: seasonsLoading, error: seasonsError } = useSeasons();
  // Keyed by the season it was read for, so a season change reads as "not loaded yet" without
  // an effect having to reset anything.
  const [loaded, setLoaded] = useState<{
    seasonId: string;
    record: StudentMasterData | null;
    error: string | null;
  } | null>(null);

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

  useEffect(() => {
    if (seasonId === null) return;

    return onSnapshot(
      doc(db, COLLECTIONS.studentMasterData, recordIdFor(seasonId, userId)),
      (snapshot) => {
        const parsed = studentMasterDataSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
        if (snapshot.exists() && !parsed.success) {
          console.error(`${snapshot.id} does not match the schema`, parsed.error);
        }
        setLoaded({
          seasonId,
          record: snapshot.exists() && parsed.success ? parsed.data : null,
          error: null,
        });
      },
      (caught) => {
        console.error("Failed to read the student's master data:", caught);
        setLoaded({ seasonId, record: null, error: caught.message });
      },
    );
  }, [seasonId, userId]);

  const settled = loaded !== null && loaded.seasonId === seasonId;

  return {
    season: active.season,
    record: settled ? loaded.record : null,
    loading: seasonsLoading || (seasonId !== null && !settled),
    error: seasonsError ?? active.error ?? (settled ? loaded.error : null),
  };
}
