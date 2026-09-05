/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { questionsAsked } from "@/lib/master-data/categories";
import { resolveEventLists } from "@/lib/master-data/resolution";
import { REGISTRATION_NOT_OPEN_HINT } from "@/lib/registration/registration";
import { useRegistration } from "@/lib/registration/use-registration";
import { RegistrationForm } from "./registration-form";

type MyRegistrationViewProps = {
  eventSeriesId: string;
  studentUid: string;
  studentName: string;
};

/**
 * The registration form for the series the path names, or the one sentence that stands in for it
 * (US-19, US-23). The series being closed and the series being gone read alike here, because to
 * a student they are the same situation: there is nothing to fill in.
 */
export function MyRegistrationView({
  eventSeriesId,
  studentUid,
  studentName,
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

  const studentClass = record?.class ?? null;

  if (
    eventSeries === null ||
    lists === null ||
    !eventSeries.isOpenToStudents ||
    studentClass === null
  ) {
    return (
      <Card>
        <CardContent>
          <p role="status">{REGISTRATION_NOT_OPEN_HINT}</p>
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
      asked={questionsAsked(lists)}
      record={record}
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
