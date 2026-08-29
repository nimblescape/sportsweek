/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { Copy, Link, QrCode, Trash2 } from "lucide-react";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeading, CardTitle } from "@/components/ui/card";
import { Tag, TagAction, TagName } from "@/components/ui/tag";
import { DeleteRegistrationDialog } from "@/components/registrations/delete-registration-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiRequestError } from "@/lib/api/client";
import {
  invitationLink,
  INVITATION_LINK_LABEL,
  INVITATION_QR_LABEL,
} from "@/lib/invitations/invitation-link";
import { InvitationQr } from "./invitation-qr";
import { classFigures, type ClassGroup, type SkillColumn } from "@/lib/assignment/statistics";
import {
  EMPTY_FILTER,
  filterStudents,
  type FilterGroup,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import { ATTENDANCE_LABELS } from "@/lib/registration/answer-labels";
import type { RosterStudent } from "@/lib/students/roster";
import { AREA, AREAS, AreaTitle, FilteredTag } from "@/components/assignment/card-areas";
import { GenderTable } from "@/components/assignment/gender-table";
import { SkillMatrix } from "@/components/assignment/skill-matrix";

const ATTENDING_LABEL = ATTENDANCE_LABELS.attending;
const NOT_ATTENDING_LABEL = ATTENDANCE_LABELS.notAttending;

/**
 * The third state of the attendance question, which the two answers cannot cover: a student who
 * followed the link and has said nothing yet (US-23). Exported so a test names it once.
 */
export const NO_ANSWER_LABEL = "Noch keine Antwort";

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
  /** The series to remove a registration from, or null where it cannot be written to (US-28). */
  removableEventSeriesId: string | null;
  /** Shown beside the class on the QR surface, so a projected code names what it enrols into. */
  eventSeriesName: string;
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
  removableEventSeriesId,
  eventSeriesName,
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
          removableEventSeriesId={removableEventSeriesId}
          eventSeriesName={eventSeriesName}
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
  removableEventSeriesId,
  eventSeriesName,
}: Omit<ClassCardsProps, "rows"> & { row: ClassGroup }) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<StudentFilter>(EMPTY_FILTER);
  const [countFiltered, setCountFiltered] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  // One across both clouds, because one student is being acted on at a time.
  const [markedId, setMarkedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterStudent | null>(null);

  const shown = filterStudents(row.students, filter);
  const figures = countFiltered ? classFigures(shown, columns) : row;

  /** Both controls mint where the class has no link yet, which is what opens the series (US-19). */
  async function withLink(mint: () => Promise<string>, deliver: (link: string) => void) {
    setLinkError(null);
    try {
      deliver(invitationLink(await mint()));
    } catch (caught) {
      setLinkError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  }

  const handOut = (mint: () => Promise<string>) =>
    withLink(mint, (link) => void navigator.clipboard.writeText(link));

  return (
    <Card size="sm" role="group" aria-label={row.class}>
      <CardContent className="flex flex-col gap-4">
        <CardHeading
          fold={{ open: expanded, label: `Details zu ${row.class}`, onOpenChange: setExpanded }}
          control={
            invitations === null ? null : (
              <>
                <Tooltip label={`${INVITATION_LINK_LABEL} kopieren`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${INVITATION_LINK_LABEL} für ${row.class} kopieren`}
                    onClick={() => handOut(() => invitations.linkFor(row.class))}
                  >
                    <Copy aria-hidden />
                  </Button>
                </Tooltip>

                <Tooltip label={`${INVITATION_QR_LABEL} anzeigen`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${INVITATION_QR_LABEL} für ${row.class} anzeigen`}
                    onClick={() => withLink(() => invitations.linkFor(row.class), setShownCode)}
                  >
                    <QrCode aria-hidden />
                  </Button>
                </Tooltip>

                {/* Regenerating a link nobody was given undoes nothing, so it is offered only
                    once there is a link to invalidate (US-23). */}
                {invitations.tokenFor(row.class) === null ? null : (
                  <Tooltip label={`${INVITATION_LINK_LABEL} neu erstellen`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${INVITATION_LINK_LABEL} für ${row.class} neu erstellen`}
                      onClick={() => setConfirmingRegenerate(true)}
                    >
                      <Link aria-hidden />
                    </Button>
                  </Tooltip>
                )}
              </>
            )
          }
        >
          <CardTitle className="truncate">{`${row.class}: ${row.total}`}</CardTitle>
        </CardHeading>

        {linkError !== null && (
          <p role="alert" className="text-destructive text-sm">
            {linkError}
          </p>
        )}

        {shownCode !== null && (
          <InvitationQr
            eventSeriesName={eventSeriesName}
            className={row.class}
            link={shownCode}
            onClose={() => setShownCode(null)}
          />
        )}

        {/* Asked rather than done, because the link may already be in a class's hands and the
            control sits one press away from the one that copies it (US-23). */}
        {confirmingRegenerate && invitations !== null && (
          <Dialog
            open
            tone="destructive"
            title={`${INVITATION_LINK_LABEL} neu erstellen`}
            onClose={() => setConfirmingRegenerate(false)}
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingRegenerate(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setConfirmingRegenerate(false);
                    void handOut(() => invitations.regenerate(row.class));
                  }}
                >
                  Neu erstellen
                </Button>
              </>
            }
          >
            <p className="text-sm">
              {`Der bisherige Link für ${row.class} funktioniert danach nicht mehr. ` +
                "Bereits registrierte Schüler:innen bleiben registriert."}
            </p>
          </Dialog>
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
                  students={shown.filter((student) => student.isAttending === true)}
                  markedId={markedId}
                  onMark={setMarkedId}
                  onRemove={removableEventSeriesId === null ? null : setRemoving}
                />
                <Cloud
                  className={row.class}
                  label={NOT_ATTENDING_LABEL}
                  students={shown.filter((student) => student.isAttending === false)}
                  markedId={markedId}
                  onMark={setMarkedId}
                  onRemove={removableEventSeriesId === null ? null : setRemoving}
                />
                {/* Empty clouds hide themselves, so a class where everybody has answered shows
                    no heading for what is outstanding. */}
                <Cloud
                  className={row.class}
                  label={NO_ANSWER_LABEL}
                  students={shown.filter((student) => student.isAttending === null)}
                  markedId={markedId}
                  onMark={setMarkedId}
                  onRemove={removableEventSeriesId === null ? null : setRemoving}
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

        {removing !== null && removableEventSeriesId !== null ? (
          <DeleteRegistrationDialog
            open
            eventSeriesId={removableEventSeriesId}
            student={removing}
            onClose={() => setRemoving(null)}
            onDeleted={() => {
              setRemoving(null);
              setMarkedId(null);
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function Cloud({
  className,
  label,
  students,
  markedId,
  onMark,
  onRemove,
}: {
  className: string;
  label: string;
  students: readonly RosterStudent[];
  markedId: string | null;
  onMark: (id: string | null) => void;
  /** Absent where the series cannot be written to, which is what takes the control away. */
  onRemove: ((student: RosterStudent) => void) | null;
}) {
  // A heading over an empty space would say a class answered nothing; the tally already does.
  if (students.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <ul aria-label={`${className}: ${label}`} className="flex flex-wrap gap-1.5">
        {students.map((student) => {
          const name = `${student.lastName} ${student.firstName}`;
          const marked = student.id === markedId;
          return (
            <li key={student.id}>
              <Tag pressed={marked}>
                <TagName label={name} onPress={() => onMark(marked ? null : student.id)} />
                {/* On the marked tag only, as a saved report's controls are (US-13, US-28). */}
                {marked && onRemove ? (
                  <TagAction
                    label={`Registrierung von ${name} löschen`}
                    onClick={() => onRemove(student)}
                  >
                    <Trash2 aria-hidden />
                  </TagAction>
                ) : null}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
