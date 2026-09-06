/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { RecordScreen } from "@/components/master-data/record-screen";
import { FilterNameField } from "@/components/filters/filter-name-field";
import { Card, CardContent } from "@/components/ui/card";
import { Tag, TagName } from "@/components/ui/tag";
import { apiRequest } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { useSelectedEventSeries } from "@/lib/event-series/use-selected-event-series";
import { classTeachersTabs, classTrail } from "@/lib/master-data/hierarchy";
import { useTeacherCandidates } from "@/lib/users/use-teacher-candidates";
import type { TeacherCandidate } from "@/lib/schemas/user";

export const FILTER_LABEL = "Lehrpersonen";

export const ASSIGNED_LABEL = "Zugewiesen";

export const NO_CANDIDATES_HINT = "Es hat sich noch keine Lehrperson angemeldet.";

export const NONE_MATCHING_HINT = "Zu diesem Filter passt keine Lehrperson.";

const LOADING_LABEL = "Lehrpersonen werden geladen …";

/** Surname first, matching the order candidates are sorted in. */
const nameOf = (candidate: TeacherCandidate) => `${candidate.lastName} ${candidate.firstName}`;

/** Matches first name, surname or address, so two colleagues sharing one are told apart either way. */
function matchesName(candidate: TeacherCandidate, name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (needle === "") return true;
  return (
    candidate.firstName.toLowerCase().includes(needle) ||
    candidate.lastName.toLowerCase().includes(needle) ||
    candidate.email.toLowerCase().includes(needle)
  );
}

function endpointFor(eventSeriesId: string): string {
  return `/api/event-series/${encodeURIComponent(eventSeriesId)}/master-data/classes/teachers`;
}

/**
 * The teachers who look after one class (US-38): a tag per candidate, pressed for assigned.
 * Pressing assigns; pressing a pressed one withdraws. There is no save button, because there is
 * no second state to be in — and no "add" affordance, since a candidate is a person who already
 * has a record, not something this screen creates (see `RecordScreen`'s optional `onAdd`).
 */
export function ClassTeachersView({
  class: named,
  eventSeriesId,
}: {
  class: string;
  eventSeriesId: string;
}) {
  const { eventSeries, loading: seriesLoading, error } = useSelectedEventSeries(eventSeriesId);
  const { candidates, loading: candidatesLoading, error: candidatesError } = useTeacherCandidates();
  const { busyId, pending, run } = useRowAction();
  const [name, setName] = useState("");
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const classOption = eventSeries?.classOptions.find((option) => option.name === named);
  const assigned = new Set(classOption?.teacherUids ?? []);

  const shown = candidates.filter(
    (candidate) => matchesName(candidate, name) && (!assignedOnly || assigned.has(candidate.uid)),
  );

  async function toggle(candidate: TeacherCandidate) {
    const isAssigned = assigned.has(candidate.uid);
    const teacherUids = isAssigned
      ? [...assigned].filter((uid) => uid !== candidate.uid)
      : [...assigned, candidate.uid];
    setFailure(null);

    await run(candidate.uid, async () => {
      try {
        await apiRequest(endpointFor(eventSeriesId), {
          method: "PATCH",
          body: { class: named, teacherUids },
        });
      } catch (thrown) {
        setFailure(thrown instanceof Error ? thrown.message : "Das hat leider nicht geklappt.");
      }
    });
  }

  const loading = seriesLoading || candidatesLoading;

  return (
    <RecordScreen
      trail={classTrail(eventSeriesId, eventSeries?.name ?? "", named)}
      tabs={classTeachersTabs(eventSeriesId, named)}
      marked="teachers"
      busy={pending}
    >
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {candidatesError ? (
        <p role="alert" className="text-destructive text-sm">
          {candidatesError}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground text-sm">{LOADING_LABEL}</p> : null}
      {!loading && candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">{NO_CANDIDATES_HINT}</p>
      ) : null}

      {candidates.length === 0 ? null : (
        <Card size="sm">
          <CardContent className="space-y-2">
            <FilterNameField label={FILTER_LABEL} value={name} onChange={setName} />

            <div
              role="group"
              aria-label={`${FILTER_LABEL}: Filter`}
              className="flex flex-wrap gap-1.5"
            >
              <Tag pressed={assignedOnly}>
                <TagName
                  label={`${FILTER_LABEL}: ${ASSIGNED_LABEL}`}
                  text={ASSIGNED_LABEL}
                  onPress={() => setAssignedOnly(!assignedOnly)}
                />
              </Tag>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && candidates.length > 0 && shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{NONE_MATCHING_HINT}</p>
      ) : null}

      <div role="group" aria-label={FILTER_LABEL} className="flex flex-wrap gap-1.5">
        {shown.map((candidate) => (
          <Tag
            key={candidate.uid}
            pressed={assigned.has(candidate.uid)}
            disabled={busyId === candidate.uid}
          >
            <TagName
              label={`${nameOf(candidate)} (${candidate.email})`}
              text={nameOf(candidate)}
              onPress={() => toggle(candidate)}
            />
          </Tag>
        ))}
      </div>
    </RecordScreen>
  );
}
