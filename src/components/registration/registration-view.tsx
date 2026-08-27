/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useBusyWhile } from "@/lib/api/busy";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { REGISTRATION_NOT_OPEN_HINT } from "@/lib/registration/registration";
import { useRegistration } from "@/lib/registration/use-registration";
import { RegistrationForm } from "./registration-form";

type RegistrationViewProps = {
  userId: string;
  studentName: string;
};

/**
 * Registering needs an event series to belong to and a class to pick from, and neither is the
 * student's to create — so until a teacher has set both up there is no form to show, only the
 * notice US-11 asks for.
 */
export function RegistrationView({ userId, studentName }: RegistrationViewProps) {
  const { eventSeries, record, loading, error } = useRegistration(userId);
  const classes = useMasterData("classes");
  const skillLevels = useMasterData("skill-levels");
  const busPickupPoints = useMasterData("bus-pickup-points");
  const foodOptions = useMasterData("food-options");
  const seasonPassOptions = useMasterData("season-pass-options");
  const programs = usePrograms();

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading || classes.loading);

  if (loading || classes.loading) return null;

  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  }

  if (eventSeries === null || classes.items.length === 0) {
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
      eventSeriesName={eventSeries.name}
      studentName={studentName}
      record={record}
      lists={{
        classes: classes.items.map((item) => item.name),
        programs: programs.programs,
        skillLevels: skillLevels.items.map((item) => item.name),
        busPickupPoints: busPickupPoints.items.map((item) => item.name),
        foodOptions: foodOptions.items.map((item) => item.name),
        seasonPassOptions: seasonPassOptions.items.map((item) => item.name),
      }}
    />
  );
}
