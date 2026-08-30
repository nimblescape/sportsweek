/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { questionsAsked } from "@/lib/master-data/categories";
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
  const skillLevels = useMasterData("skill-levels", eventSeriesId);
  const busPickupPoints = useMasterData("bus-pickup-points", eventSeriesId);
  const foodOptions = useMasterData("food-options", eventSeriesId);
  const seasonPassOptions = useMasterData("season-pass-options", eventSeriesId);
  const programs = usePrograms(eventSeriesId);

  if (loading) return null;

  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  }

  const studentClass = record?.class ?? null;

  if (eventSeries === null || !eventSeries.isOpenToStudents || studentClass === null) {
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
      asked={questionsAsked(eventSeries)}
      record={record}
      lists={{
        programs: programs.programs,
        skillLevels: skillLevels.items,
        busPickupPoints: busPickupPoints.items,
        foodOptions: foodOptions.items,
        seasonPassOptions: seasonPassOptions.items,
      }}
    />
  );
}
