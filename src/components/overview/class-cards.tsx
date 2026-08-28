/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { ChevronRight, Copy, RefreshCw } from "lucide-react";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiRequestError } from "@/lib/api/client";
import { invitationLink } from "@/lib/invitations/invitation-link";
import { classFigures, type ClassGroup, type SkillColumn } from "@/lib/assignment/statistics";
import {
  EMPTY_FILTER,
  filterStudents,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import { ATTENDANCE_LABELS } from "@/lib/registration/answer-labels";
import type { RosterStudent } from "@/lib/students/roster";
import { cn } from "@/lib/utils";
import { AREA, AREAS, AreaTitle, FilteredTag } from "@/components/assignment/card-areas";
import { GenderTable } from "@/components/assignment/gender-table";
import { SkillMatrix } from "@/components/assignment/skill-matrix";

const ATTENDING_LABEL = ATTENDANCE_LABELS.attending;
const NOT_ATTENDING_LABEL = ATTENDANCE_LABELS.notAttending;

/** What a card may do with its class's link; null where the series can never be opened (US-19). */
export type InvitationControls = {
  tokenFor: (className: string) => string | null;
  linkFor: (className: string) => Promise<string>;
  regenerate: (className: string) => Promise<string>;
};

type ClassCardsProps = {
  rows: readonly ClassGroup[];
  programs: readonly string[];
  skillLevels: readonly string[];
  /** The columns the rows were counted with, so a filtered recount lines up with them. */
  columns: readonly SkillColumn[];
  filterGroups: readonly FilterGroup[];
  invitations: InvitationControls | null;
};

/**
 * Registrations per class (US-12). Only these cards count the students who answered "no": they
 * are what "Registriert" and the share are about, and they appear in no other figure, because
 * only a student who is coming can be assigned to an event.
 */
export function ClassCards({
  rows,
  programs,
  skillLevels,
  columns,
  filterGroups,
  invitations,
}: ClassCardsProps) {
  // A card is one class already, so offering the class tags would only let it empty itself.
  const groups = filterGroups.filter((group) => group.category !== "class");

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <ClassCard
          key={row.class}
          row={row}
          programs={programs}
          skillLevels={skillLevels}
          columns={columns}
          filterGroups={groups}
          invitations={invitations}
        />
      ))}
    </div>
  );
}

function ClassCard({
  row,
  programs,
  skillLevels,
  columns,
  filterGroups,
  invitations,
}: Omit<ClassCardsProps, "rows"> & { row: ClassGroup }) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<StudentFilter>(EMPTY_FILTER);
  const [countFiltered, setCountFiltered] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const shown = filterStudents(row.students, filter);
  const figures = countFiltered ? classFigures(shown, columns) : row;

  async function handOut(mint: () => Promise<string>) {
    setLinkError(null);
    try {
      await navigator.clipboard.writeText(invitationLink(await mint()));
    } catch (caught) {
      setLinkError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  }

  return (
    <Card size="sm" role="group" aria-label={row.class}>
      <CardContent className="flex flex-col gap-4">
        {/* The controls sit at the card's edge rather than after the title, so they line up down
            the page instead of moving with the length of each class's name and count. */}
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{`${row.class}: ${row.total}`}</span>
          <div className="flex shrink-0 items-center gap-1">
            {invitations === null ? null : (
              <>
                <Tooltip label="Link kopieren">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Link für ${row.class} kopieren`}
                    onClick={() => handOut(() => invitations.linkFor(row.class))}
                  >
                    <Copy aria-hidden />
                  </Button>
                </Tooltip>

                {/* Regenerating a link nobody was given undoes nothing, so it is offered only
                    once there is a link to invalidate (US-23). */}
                {invitations.tokenFor(row.class) === null ? null : (
                  <Tooltip label="Link neu erstellen">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Link für ${row.class} neu erstellen`}
                      onClick={() => handOut(() => invitations.regenerate(row.class))}
                    >
                      <RefreshCw aria-hidden />
                    </Button>
                  </Tooltip>
                )}
              </>
            )}

            <button
              type="button"
              aria-label={`Details zu ${row.class}`}
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md p-0.5 transition-colors outline-none focus-visible:ring-3"
            >
              <ChevronRight
                aria-hidden
                className={cn("size-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          </div>
        </CardTitle>

        {linkError !== null && (
          <p role="alert" className="text-destructive text-sm">
            {linkError}
          </p>
        )}

        {expanded && (
          <div className={AREAS}>
            <section className={AREA}>
              <AreaTitle>Filter</AreaTitle>
              <FilterTagList
                label={row.class}
                groups={filterGroups}
                value={filter}
                onChange={setFilter}
              />
            </section>

            {/* Two clouds rather than one list with a marker on it: whether someone is coming is
                the first thing a teacher reads off a class, and the split answers it at a glance. */}
            <section className={AREA}>
              <AreaTitle
                aside={
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {shown.length} von {row.students.length} angezeigt
                  </span>
                }
              >
                Schüler:innen
              </AreaTitle>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <Cloud
                  className={row.class}
                  label={ATTENDING_LABEL}
                  students={shown.filter((student) => student.isAttending)}
                />
                <Cloud
                  className={row.class}
                  label={NOT_ATTENDING_LABEL}
                  students={shown.filter((student) => !student.isAttending)}
                />
              </div>
            </section>

            <section className={AREA}>
              <AreaTitle
                aside={
                  <FilteredTag
                    card={row.class}
                    pressed={countFiltered}
                    onPress={() => setCountFiltered(!countFiltered)}
                  />
                }
              >
                Statistik
              </AreaTitle>
              <div className="flex flex-col gap-3">
                <GenderTable counts={figures} registeredTotal={figures.total} />
                {/* With neither list there is nothing left to count by, and no question was ever
                    asked (US-21); with one of them the matrix carries an "Anzahl" line. */}
                {programs.length > 0 || skillLevels.length > 0 ? (
                  <SkillMatrix
                    counts={figures.skillLevels}
                    programs={programs}
                    skillLevels={skillLevels}
                  />
                ) : null}
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Cloud({
  className,
  label,
  students,
}: {
  className: string;
  label: string;
  students: readonly RosterStudent[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <ul aria-label={`${className}: ${label}`} className="flex flex-wrap gap-1.5">
        {students.map((student) => (
          <li
            key={student.id}
            className="border-border bg-background rounded-md border px-2 py-1 text-sm"
          >
            {`${student.lastName} ${student.firstName}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
