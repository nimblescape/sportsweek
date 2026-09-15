/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { asUid } from "@/lib/schemas/common";
import type { EventSeries } from "@/lib/schemas/event-series";
import { classAssignmentsOf } from "./teacher-class-assignments";

const TEACHER = asUid("uidTeacher");
const COLLEAGUE = asUid("uidColleague");

function series(name: string, classOptions: { name: string; teacherUids: string[] }[]) {
  return { name, classOptions } as unknown as EventSeries;
}

describe("classAssignmentsOf", () => {
  it("names the series and class of every class this teacher looks after", () => {
    const eventSeries = [
      series("Wintersportwoche 2026/2027", [
        { name: "2aWI", teacherUids: [TEACHER] },
        { name: "2bWI", teacherUids: [COLLEAGUE] },
      ]),
    ];

    expect(classAssignmentsOf(eventSeries, TEACHER)).toEqual([
      { eventSeriesName: "Wintersportwoche 2026/2027", className: "2aWI" },
    ]);
  });

  it("names a class the same teacher looks after in more than one series", () => {
    const eventSeries = [
      series("Wintersportwoche 2026/2027", [{ name: "2aWI", teacherUids: [TEACHER] }]),
      series("Sommersportwoche 2026/2027", [{ name: "2aWI", teacherUids: [TEACHER] }]),
    ];

    expect(classAssignmentsOf(eventSeries, TEACHER)).toEqual([
      { eventSeriesName: "Wintersportwoche 2026/2027", className: "2aWI" },
      { eventSeriesName: "Sommersportwoche 2026/2027", className: "2aWI" },
    ]);
  });

  it("returns an empty list for a teacher who looks after nothing", () => {
    const eventSeries = [series("Wintersportwoche 2026/2027", [{ name: "2aWI", teacherUids: [] }])];

    expect(classAssignmentsOf(eventSeries, TEACHER)).toEqual([]);
  });
});
