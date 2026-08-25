import { describe, expect, it } from "vitest";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { zodConverter } from "@/lib/firebase/converters";
import { seasonSchema } from "@/lib/schemas/season";

const converter = zodConverter(seasonSchema);

function snapshotOf(id: string, data: Record<string, unknown>) {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe("zodConverter", () => {
  it("drops the id when writing, since it lives in the document path", () => {
    const written = converter.toFirestore({
      id: "season-1",
      name: "Wintersportwoche 2026",
      isActive: true,
      isArchived: false,
    });

    expect(written).toEqual({ name: "Wintersportwoche 2026", isActive: true, isArchived: false });
    expect(written).not.toHaveProperty("id");
  });

  it("restores the id from the document when reading", () => {
    const model = converter.fromFirestore(
      snapshotOf("season-1", {
        name: "Wintersportwoche 2026",
        isActive: true,
        isArchived: false,
      }),
      {},
    );

    expect(model).toEqual({
      id: "season-1",
      name: "Wintersportwoche 2026",
      isActive: true,
      isArchived: false,
    });
  });

  it("rejects a stored document that violates the schema", () => {
    expect(() =>
      converter.fromFirestore(snapshotOf("season-1", { name: "", isActive: "yes" }), {}),
    ).toThrow();
  });
});
