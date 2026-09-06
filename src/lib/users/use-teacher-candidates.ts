/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import type { TeacherCandidate } from "@/lib/schemas/user";

export type TeacherCandidatesState = {
  candidates: TeacherCandidate[];
  loading: boolean;
  error: string | null;
};

const LOADING: TeacherCandidatesState = { candidates: [], loading: true, error: null };

/**
 * Every teacher a class assignment may name (US-38). `users` stays closed to `editMasterData` at
 * the rules layer, so this is a guarded server read rather than a live query — fetching once is
 * enough, since the staff room changes rarely enough that a stale list costs nothing a reload
 * would not also cost (mirrors `useUsageReport`).
 */
export function useTeacherCandidates(): TeacherCandidatesState {
  const [state, setState] = useState<TeacherCandidatesState>(LOADING);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/users/teacher-candidates");
        if (!response.ok) throw new Error(`${response.status}`);
        const body: unknown = await response.json();
        const candidates =
          body !== null &&
          typeof body === "object" &&
          Array.isArray((body as { candidates?: unknown }).candidates)
            ? (body as { candidates: TeacherCandidate[] }).candidates
            : [];
        if (active) {
          setState({ candidates: [...candidates].sort(byName), loading: false, error: null });
        }
      } catch (error) {
        console.error("Failed to read teacher candidates:", error);
        if (active) {
          setState({ candidates: [], loading: false, error: "Das hat leider nicht geklappt." });
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** Surname first, matching every other staff list. */
function byName(a: TeacherCandidate, b: TeacherCandidate): number {
  return (
    a.lastName.localeCompare(b.lastName, "de-AT") || a.firstName.localeCompare(b.firstName, "de-AT")
  );
}
