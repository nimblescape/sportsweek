/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { zodConverter } from "@/lib/firebase/converters";
import { eventSeriesSchema } from "@/lib/schemas/event-series";

const converter = zodConverter(eventSeriesSchema);

function snapshotOf(id: string, data: Record<string, unknown>) {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe("zodConverter", () => {
  it("drops the id when writing, since it lives in the document path", () => {
    const written = converter.toFirestore({
      id: "event series-1",
      name: "Wintersportwoche 2026",
      isActive: true,
      isArchived: false,
      hasRegistrations: false,
      position: 0,
    });

    expect(written).toEqual({
      name: "Wintersportwoche 2026",
      isActive: true,
      isArchived: false,
      hasRegistrations: false,
      position: 0,
    });
    expect(written).not.toHaveProperty("id");
  });

  it("restores the id from the document when reading", () => {
    const model = converter.fromFirestore(
      snapshotOf("event series-1", {
        name: "Wintersportwoche 2026",
        isActive: true,
        isArchived: false,
        hasRegistrations: false,
        position: 0,
      }),
      {},
    );

    expect(model).toEqual({
      id: "event series-1",
      name: "Wintersportwoche 2026",
      isActive: true,
      isArchived: false,
      hasRegistrations: false,
      position: 0,
    });
  });

  it("rejects a stored document that violates the schema", () => {
    expect(() =>
      converter.fromFirestore(snapshotOf("event series-1", { name: "", isActive: "yes" }), {}),
    ).toThrow();
  });
});
