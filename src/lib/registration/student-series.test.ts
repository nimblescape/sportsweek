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

const STUDENT = "schuelerin@student.htldornbirn.at";

function seedSeries(id: string, overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed(
    "eventSeries",
    id,
    storedEventSeries({ name: id, isOpenToStudents: true, hasRegistrations: true, ...overrides }),
  );
}

beforeEach(() => firestore.reset());

describe("openSeriesOfStudent", () => {
  it("returns the open series the student has joined", async () => {
    seedSeries("winter");
    firestore.seed("eventSeries/winter/registrations", STUDENT, { studentUid: STUDENT });

    const found = await openSeriesOfStudent(STUDENT);

    expect(found.map((one) => one.id)).toEqual(["winter"]);
  });

  /** An open series nobody invited them to is not theirs: joining is what a link does (US-23). */
  it("leaves out an open series the student has not joined", async () => {
    seedSeries("kultur");

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  /** Past series are closed, which is what keeps the chooser away in the ordinary case (Q7). */
  it("leaves out a closed series the student registered in years ago", async () => {
    seedSeries("winter24", { isOpenToStudents: false });
    firestore.seed("eventSeries/winter24/registrations", STUDENT, { studentUid: STUDENT });

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  it("leaves out a registration belonging to somebody else", async () => {
    seedSeries("winter");
    firestore.seed("eventSeries/winter/registrations", "andere@student.htldornbirn.at", {
      studentUid: "andere@student.htldornbirn.at",
    });

    await expect(openSeriesOfStudent(STUDENT)).resolves.toEqual([]);
  });

  it("returns both where a Wintersportwoche and a Kulturwoche are open together", async () => {
    seedSeries("kultur", { position: 2 });
    seedSeries("winter", { position: 1 });
    firestore.seed("eventSeries/kultur/registrations", STUDENT, { studentUid: STUDENT });
    firestore.seed("eventSeries/winter/registrations", STUDENT, { studentUid: STUDENT });

    const found = await openSeriesOfStudent(STUDENT);

    expect(found.map((one) => one.id)).toEqual(["winter", "kultur"]);
  });
});
