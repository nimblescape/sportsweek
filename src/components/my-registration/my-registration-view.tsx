/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { classIsOpen } from "@/lib/event-series/event-series-state";
import { questionsFor, resolveEventLists } from "@/lib/master-data/resolution";
import {
  CLASS_CLOSED_KEEP_LINK_HINT,
  REGISTRATION_NOT_OPEN_HINT,
} from "@/lib/registration/registration";
import { useRegistration } from "@/lib/registration/use-registration";
import { RegistrationForm } from "./registration-form";

type MyRegistrationViewProps = {
  eventSeriesId: string;
  studentUid: string;
  studentName: string;
  /** Set by the join route for a live link to a class that is currently closed (US-45). */
  linkClosed?: boolean;
};

/**
 * The registration form for the series the path names, or the one sentence that stands in for it
 * (US-19, US-23). The series being gone and the student holding no registration for it read alike
 * here, because to a student who never joined there is nothing to fill in either way — unless
 * `linkClosed` says the link that sent them here is merely shut rather than dead, which is worth
 * a different sentence (US-45).
 *
 * A class that closed after a registration already exists is a different situation again: the
 * record is not withheld, it is shown read-only (US-45), which is the form's own job to render.
 */
export function MyRegistrationView({
  eventSeriesId,
  studentUid,
  studentName,
  linkClosed = false,
}: MyRegistrationViewProps) {
  const { eventSeries, record, loading, error } = useRegistration(eventSeriesId, studentUid);

  // Resolved from the student's own event where a teacher has assigned one, falling back to the
  // series' (US-33, US-35) — computed once here, next to the record it reads the event from,
  // rather than by the form, so nothing downstream comes to resolve it a second way.
  const lists = useMemo(
    () => (eventSeries === null ? null : resolveEventLists(eventSeries, record?.event ?? null)),
    [eventSeries, record?.event],
  );

  if (loading) return null;

  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  }

  if (eventSeries === null || lists === null) {
    return (
      <Card>
        <CardContent>
          <p role="status">{REGISTRATION_NOT_OPEN_HINT}</p>
        </CardContent>
      </Card>
    );
  }

  const studentClass = record?.class ?? null;

  if (studentClass === null) {
    return (
      <Card>
        <CardContent>
          <p role="status">
            {linkClosed ? CLASS_CLOSED_KEEP_LINK_HINT : REGISTRATION_NOT_OPEN_HINT}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <RegistrationForm
      // Remounts on an event series change, so the form starts from that event series' record rather than
      // from the one it was initialised with.
      key={eventSeries.id}
      eventSeriesId={eventSeries.id}
      eventSeriesName={eventSeries.name}
      studentName={studentName}
      studentClass={studentClass}
      asked={questionsFor(eventSeries, record?.event ?? null)}
      record={record}
      // A registration on a class that has since closed is shown, not withheld (US-45).
      readOnly={!classIsOpen(eventSeries.classOptions, studentClass)}
      lists={{
        programs: lists.programs,
        skillLevels: lists.skillLevels,
        busPickupPoints: lists.busPickupPoints,
        foodOptions: lists.foodOptions,
        seasonPassOptions: lists.seasonPassOptions,
      }}
    />
  );
}
