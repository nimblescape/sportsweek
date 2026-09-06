/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import { asUid } from "@/lib/schemas/common";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: (path: string) => firestore.collection(path) },
}));

const { applyClassAssignments } = await import("@/lib/auth/class-assignments");

async function seedSeries(id: string, overrides: Parameters<typeof storedEventSeries>[0] = {}) {
  await firestore.collection("eventSeries").doc(id).set(storedEventSeries(overrides));
}

describe("applyClassAssignments", () => {
  it("adds the new uid to each named class's teachers", async () => {
    await seedSeries("s1", {
      classOptions: [
        { name: "2aWI", teacherUids: [] },
        { name: "2bWI", teacherUids: [] },
      ],
    });

    await applyClassAssignments("uid-1", [{ eventSeriesId: "s1", class: "2aWI" }]);

    const stored = await firestore.collection("eventSeries").doc("s1").get();
    expect(stored.data()?.classOptions).toEqual([
      { name: "2aWI", teacherUids: [asUid("uid-1")] },
      { name: "2bWI", teacherUids: [] },
    ]);
  });

  it("matches the class name ignoring surrounding whitespace and letter case", async () => {
    await seedSeries("s1", { classOptions: [{ name: "2aWI", teacherUids: [] }] });

    await applyClassAssignments("uid-1", [{ eventSeriesId: "s1", class: " 2awi " }]);

    const stored = await firestore.collection("eventSeries").doc("s1").get();
    expect(stored.data()?.classOptions).toEqual([{ name: "2aWI", teacherUids: [asUid("uid-1")] }]);
  });

  it("does not add the uid twice", async () => {
    await seedSeries("s1", {
      classOptions: [{ name: "2aWI", teacherUids: [asUid("uid-1")] }],
    });

    await applyClassAssignments("uid-1", [{ eventSeriesId: "s1", class: "2aWI" }]);

    const stored = await firestore.collection("eventSeries").doc("s1").get();
    expect(stored.data()?.classOptions).toEqual([{ name: "2aWI", teacherUids: [asUid("uid-1")] }]);
  });

  it("applies several assignments in the same series in one write", async () => {
    await seedSeries("s1", {
      classOptions: [
        { name: "2aWI", teacherUids: [] },
        { name: "2bWI", teacherUids: [] },
      ],
    });

    await applyClassAssignments("uid-1", [
      { eventSeriesId: "s1", class: "2aWI" },
      { eventSeriesId: "s1", class: "2bWI" },
    ]);

    const stored = await firestore.collection("eventSeries").doc("s1").get();
    expect(stored.data()?.classOptions).toEqual([
      { name: "2aWI", teacherUids: [asUid("uid-1")] },
      { name: "2bWI", teacherUids: [asUid("uid-1")] },
    ]);
  });

  it("applies assignments across several series", async () => {
    await seedSeries("s1", { classOptions: [{ name: "2aWI", teacherUids: [] }] });
    await seedSeries("s2", { classOptions: [{ name: "3aWI", teacherUids: [] }] });

    await applyClassAssignments("uid-1", [
      { eventSeriesId: "s1", class: "2aWI" },
      { eventSeriesId: "s2", class: "3aWI" },
    ]);

    expect(
      (await firestore.collection("eventSeries").doc("s1").get()).data()?.classOptions,
    ).toEqual([{ name: "2aWI", teacherUids: [asUid("uid-1")] }]);
    expect(
      (await firestore.collection("eventSeries").doc("s2").get()).data()?.classOptions,
    ).toEqual([{ name: "3aWI", teacherUids: [asUid("uid-1")] }]);
  });

  it("skips an entry naming a series that is no longer there, silently", async () => {
    await expect(
      applyClassAssignments("uid-1", [{ eventSeriesId: "gone", class: "2aWI" }]),
    ).resolves.toBeUndefined();
  });

  it("skips an entry naming a class that is no longer in the series, silently", async () => {
    await seedSeries("s1", { classOptions: [{ name: "2aWI", teacherUids: [] }] });

    await applyClassAssignments("uid-1", [{ eventSeriesId: "s1", class: "gone" }]);

    const stored = await firestore.collection("eventSeries").doc("s1").get();
    expect(stored.data()?.classOptions).toEqual([{ name: "2aWI", teacherUids: [] }]);
  });

  it("does nothing when given no assignments", async () => {
    await expect(applyClassAssignments("uid-1", [])).resolves.toBeUndefined();
  });
});
