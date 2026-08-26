/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useBusyWhile } from "@/lib/api/busy";
import { useMasterData, usePrograms } from "@/lib/master-data/use-master-data";
import { REGISTRATION_NOT_OPEN_HINT } from "@/lib/student-master-data/registration";
import { useStudentMasterData } from "@/lib/student-master-data/use-student-master-data";
import { StudentMasterDataForm } from "./student-master-data-form";

type StudentMasterDataViewProps = {
  userId: string;
  studentName: string;
};

/**
 * Registering needs a season to belong to and a class to pick from, and neither is the
 * student's to create — so until a teacher has set both up there is no form to show, only the
 * notice US-11 asks for.
 */
export function StudentMasterDataView({ userId, studentName }: StudentMasterDataViewProps) {
  const { season, record, loading, error } = useStudentMasterData(userId);
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

  if (season === null || classes.items.length === 0) {
    return (
      <Card>
        <CardContent>
          <p role="status">{REGISTRATION_NOT_OPEN_HINT}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <StudentMasterDataForm
      // Remounts on a season change, so the form starts from that season's record rather than
      // from the one it was initialised with.
      key={season.id}
      seasonName={season.name}
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
