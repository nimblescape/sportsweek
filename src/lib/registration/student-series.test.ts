/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { openSeriesOfStudent } = await import("./student-series");

const STUDENT = "uidSchuelerin";

function seedSeries(id: string, overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed(
    "eventSeries",
    id,
    storedEventSeries({ name: id, hasRegistrations: true, ...overrides }),
  );
}

beforeEach(() => firestore.reset());

describe("openSeriesOfStudent", () => {
  it("returns a series the student has joined", async () => {
    seedSeries("winter");
    firestore.seed("eventSeries/winter/registrations", STUDENT, { studentUid: STUDENT });

    const found = await openSeriesOfStudent(STUDENT);

    expect(found.map((one) => one.id)).toEqual(["winter"]);
  });

  it("leaves out a series the student has not joined", async () => {
    seedSeries("kultur");

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  /** Closing a class evicts nobody (US-43), so a closed series still shows its own student. */
  it("keeps a closed series the student is registered in, read-only or not", async () => {
    seedSeries("winter24", {
      classOptions: [{ name: "3AHME", teacherUids: [], isOpenToStudents: false }],
    });
    firestore.seed("eventSeries/winter24/registrations", STUDENT, { studentUid: STUDENT });

    const found = await openSeriesOfStudent(STUDENT);

    expect(found.map((one) => one.id)).toEqual(["winter24"]);
  });

  /** Archiving is what ends a registration's visible life, not closing (US-45). */
  it("leaves out an archived series the student registered in years ago", async () => {
    seedSeries("winter24", { isArchived: true });
    firestore.seed("eventSeries/winter24/registrations", STUDENT, { studentUid: STUDENT });

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  it("leaves out a registration belonging to somebody else", async () => {
    seedSeries("winter");
    firestore.seed("eventSeries/winter/registrations", "andere@student.htldornbirn.at", {
      studentUid: "uidAndere",
    });

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  it("returns both where a Wintersportwoche and a Kulturwoche are joined together", async () => {
    seedSeries("kultur", { position: 2 });
    seedSeries("winter", { position: 1 });
    firestore.seed("eventSeries/kultur/registrations", STUDENT, { studentUid: STUDENT });
    firestore.seed("eventSeries/winter/registrations", STUDENT, { studentUid: STUDENT });

    const found = await openSeriesOfStudent(STUDENT);

    expect(found.map((one) => one.id)).toEqual(["winter", "kultur"]);
  });
});
