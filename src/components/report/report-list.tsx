/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import {
  INCOMPLETE_REGISTRATION_HINT,
  NO_ANSWER,
  type ReportField,
} from "@/lib/report/report-fields";
import type { RosterStudent } from "@/lib/students/roster";

type ReportListProps = {
  students: readonly RosterStudent[];
  fields: readonly ReportField[];
};

/**
 * The report of US-13, as a master-detail list rather than a table: one master line per student,
 * carrying the name and the e-mail address that are always shown, with the activated fields
 * hanging off it as indented detail lines.
 */
export function ReportList({ students, fields }: ReportListProps) {
  if (students.length === 0) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Keine Schüler:innen gefunden.
      </p>
    );
  }

  return (
    <ul aria-label="Schüler:innen" className="divide-border divide-y">
      {students.map((student) => (
        <li key={student.id} className="py-2 first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">
              {student.firstName} {student.lastName}
            </span>
            <span className="text-muted-foreground break-all">({student.email})</span>
            {student.record.isIncomplete ? (
              <span className="text-destructive text-xs">{INCOMPLETE_REGISTRATION_HINT}</span>
            ) : null}
          </p>

          {fields.length > 0 ? (
            <dl className="mt-1 ml-6 flex flex-col gap-0.5 text-sm">
              {fields.map((field) => (
                <div key={field.key} className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">{field.label}:</dt>
                  <dd>{field.valueOf(student.record) ?? NO_ANSWER}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
