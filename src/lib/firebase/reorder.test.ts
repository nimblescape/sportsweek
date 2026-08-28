/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: firestore,
}));

const { reorderCollection } = await import("./reorder");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

function seed(collection: string, entries: Record<string, Record<string, unknown>>) {
  for (const [id, data] of Object.entries(entries)) firestore.seed(collection, id, data);
}

function positionsOf(collection: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(firestore.docs(collection)).map(([id, data]) => [id, data.position]),
  );
}

describe("reorderCollection", () => {
  beforeEach(() =>
    seed("eventSeries", {
      a: { name: "A", position: 0 },
      b: { name: "B", position: 1 },
      c: { name: "C", position: 2 },
    }),
  );

  it("writes the requested order as consecutive positions from zero", async () => {
    await reorderCollection({ collection: "eventSeries", orderedIds: ["c", "a", "b"] });

    expect(positionsOf("eventSeries")).toEqual({ c: 0, a: 1, b: 2 });
  });

  it("leaves the names untouched, since ordering changes no stored value", async () => {
    await reorderCollection({ collection: "eventSeries", orderedIds: ["c", "a", "b"] });

    expect(firestore.get("eventSeries", "a")).toMatchObject({ name: "A" });
  });

  it("reports an id that is not in the collection", async () => {
    await expect(
      reorderCollection({ collection: "eventSeries", orderedIds: ["a", "ghost"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("changes nothing when an id is rejected", async () => {
    await expect(
      reorderCollection({ collection: "eventSeries", orderedIds: ["c", "ghost"] }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(positionsOf("eventSeries")).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("rejects a repeated id rather than silently dropping one", async () => {
    await expect(
      reorderCollection({ collection: "eventSeries", orderedIds: ["a", "a", "b"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // A teacher adding an item while another reorders must not have it vanish from the list.
  it("appends an item the caller never saw, keeping it visible", async () => {
    firestore.seed("eventSeries", "d", { name: "D", position: 3 });

    await reorderCollection({ collection: "eventSeries", orderedIds: ["c", "b", "a"] });

    expect(positionsOf("eventSeries")).toEqual({ c: 0, b: 1, a: 2, d: 3 });
  });

  it("orders several unseen items among themselves by their previous position", async () => {
    firestore.seed("eventSeries", "e", { name: "E", position: 9 });
    firestore.seed("eventSeries", "d", { name: "D", position: 4 });

    await reorderCollection({ collection: "eventSeries", orderedIds: ["a"] });

    expect(positionsOf("eventSeries")).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4 });
  });

  it("accepts an empty collection without writing anything", async () => {
    firestore.reset();

    await reorderCollection({ collection: "eventSeries", orderedIds: [] });

    expect(firestore.commitCount).toBe(0);
  });
});

describe("reorderCollection — scoped to a parent", () => {
  beforeEach(() =>
    seed("events", {
      a: { eventSeriesId: "s1", name: "A", position: 0 },
      b: { eventSeriesId: "s1", name: "B", position: 1 },
      x: { eventSeriesId: "s2", name: "X", position: 0 },
      y: { eventSeriesId: "s2", name: "Y", position: 1 },
    }),
  );

  it("renumbers only the items of the scope it was given", async () => {
    await reorderCollection({
      collection: "events",
      orderedIds: ["b", "a"],
      scope: { field: "eventSeriesId", value: "s1" },
    });

    expect(positionsOf("events")).toEqual({ b: 0, a: 1, x: 0, y: 1 });
  });

  it("refuses an id belonging to a different scope", async () => {
    await expect(
      reorderCollection({
        collection: "events",
        orderedIds: ["a", "x"],
        scope: { field: "eventSeriesId", value: "s1" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
