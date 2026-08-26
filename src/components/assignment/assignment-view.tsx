/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo, useState } from "react";
import { classOverview, eventOverview, skillColumns } from "@/lib/assignment/statistics";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useEvents } from "@/lib/events/use-events";
import { filterGroups } from "@/lib/filters/student-filter";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { activeSeasonOf, NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";
import { useSeasons } from "@/lib/seasons/use-seasons";
import { useRoster } from "@/lib/students/use-roster";
import { ClassCards } from "./class-cards";
import { EventCards } from "./event-cards";
import { TransferLists } from "./transfer-lists";

/**
 * The assignment dialog of US-12, scoped to the active season: who registered, how the classes
 * and events stand, and the two lists a teacher moves students between.
 *
 * The tables are computed from the same live roster the lists are drawn from, so an assignment
 * shows up in the figures as soon as the subscription brings the record back.
 */
export function AssignmentView() {
  const { seasons, loading: seasonsLoading, error: seasonsError } = useSeasons();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Two active seasons is a data defect a teacher cannot act on here, so it is reported rather
  // than thrown — a throw would take the page down with it.
  const active = useMemo(() => {
    try {
      return { season: activeSeasonOf(seasons), error: null };
    } catch (caught) {
      return { season: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [seasons]);

  const seasonId = active.season?.id ?? null;
  // No season means no id to scope by, and a query for the empty one matches nothing — which is
  // what this view shows anyway.
  const { events, loading: eventsLoading } = useEvents(seasonId ?? "");
  const { students, loading: rosterLoading, error: rosterError } = useRoster(seasonId);
  const classes = useMasterData("classes");
  const skillLevels = useMasterData("skill-levels");
  const { programs } = usePrograms();

  const loading = seasonsLoading || eventsLoading || rosterLoading || classes.loading;

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading);

  const columns = useMemo(
    () => skillColumns(programs, skillLevels.items),
    [programs, skillLevels.items],
  );
  const programNames = useMemo(() => programs.map((program) => program.name), [programs]);
  const skillLevelNames = useMemo(
    () => skillLevels.items.map((item) => item.name),
    [skillLevels.items],
  );
  const groups = useMemo(
    () => filterGroups({ classes: classes.items, programs, skillLevels: skillLevels.items }),
    [classes.items, programs, skillLevels.items],
  );

  const error = seasonsError ?? active.error ?? rosterError;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  // Only a student who is coming can be assigned to an event (US-11), so the lists never show
  // the others — the class table above is the one place they are counted.
  const attending = students.filter((student) => student.isAttending);

  async function assign(recordIds: string[], eventId: string | null) {
    await apiRequest("/api/assignments", { method: "PATCH", body: { recordIds, eventId } });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="font-heading text-lg font-semibold">Zuteilung</h1>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {active.season === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_ACTIVE_SEASON_HINT}
        </p>
      ) : (
        <>
          <ClassCards
            rows={classOverview(students, classes.items, columns)}
            programs={programNames}
            skillLevels={skillLevelNames}
          />

          {events.length === 0 ? (
            <p role="status" className="text-muted-foreground text-sm">
              Für diese Saison gibt es noch keine Events.
            </p>
          ) : (
            <>
              <EventCards
                rows={eventOverview(attending, events, columns)}
                programs={programNames}
                skillLevels={skillLevelNames}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
              />

              <TransferLists
                // Deliberately not keyed by the event: picking one says which students the
                // right list holds, not how either list is filtered.
                eventName={selectedEvent?.name ?? null}
                unassigned={attending.filter((student) => student.eventId === null)}
                assigned={attending.filter((student) => student.eventId === selectedEvent?.id)}
                groups={groups}
                onAssign={(recordIds) => assign(recordIds, selectedEvent?.id ?? null)}
                onUnassign={(recordIds) => assign(recordIds, null)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
