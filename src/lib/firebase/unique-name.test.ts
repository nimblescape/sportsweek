import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { assertNameIsFree, normalizeName } = await import("./unique-name");
const { ServiceError } = await import("@/lib/service-error");

beforeEach(() => firestore.reset());

describe("normalizeName", () => {
  it.each([
    ["Montafon", "montafon"],
    ["  Montafon  ", "montafon"],
    ["MONTAFON", "montafon"],
    ["MonTaFon", "montafon"],
  ])("reduces %s to a comparable form", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("keeps names that genuinely differ apart", () => {
    expect(normalizeName("Montafon")).not.toBe(normalizeName("Montafon Nord"));
  });

  it("treats German umlauts as distinct characters rather than folding them away", () => {
    expect(normalizeName("Grün")).not.toBe(normalizeName("Grun"));
  });
});

async function check(name: string, options: Record<string, unknown> = {}) {
  return firestore.runTransaction((transaction) =>
    assertNameIsFree(transaction as never, {
      collection: "seasons",
      name,
      ...options,
    }),
  );
}

describe("assertNameIsFree", () => {
  it("accepts a name nobody uses", async () => {
    await expect(check("Winter 2026")).resolves.toBeUndefined();
  });

  it("rejects an exact duplicate", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("Winter 2026")).rejects.toBeInstanceOf(ServiceError);
  });

  it("reports the clash as a conflict, so the handler answers 409", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("Winter 2026")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("explains the clash in German", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("Winter 2026")).rejects.toThrow(/gibt es bereits/i);
  });

  it("rejects a duplicate that differs only in case", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("WINTER 2026")).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects a duplicate that differs only in surrounding whitespace", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("  Winter 2026  ")).rejects.toBeInstanceOf(ServiceError);
  });

  it("allows a name that merely starts the same", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("Winter 2026/27")).resolves.toBeUndefined();
  });

  it("ignores the record being renamed, so saving an unchanged name is fine", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });

    await expect(check("Winter 2026", { exceptId: "s1" })).resolves.toBeUndefined();
  });

  it("still rejects renaming onto a different record's name", async () => {
    firestore.seed("seasons", "s1", { name: "Winter 2026" });
    firestore.seed("seasons", "s2", { name: "Winter 2027" });

    await expect(check("Winter 2027", { exceptId: "s1" })).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("assertNameIsFree — scoped to a parent", () => {
  const scoped = (name: string, seasonId: string) =>
    firestore.runTransaction((transaction) =>
      assertNameIsFree(transaction as never, {
        collection: "events",
        name,
        scope: { field: "seasonId", value: seasonId },
      }),
    );

  it("rejects a duplicate inside the same season", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(scoped("Montafon", "s1")).rejects.toBeInstanceOf(ServiceError);
  });

  it("allows the same name in a different season", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(scoped("Montafon", "s2")).resolves.toBeUndefined();
  });

  it("names the season in the message, so the teacher knows where the clash is", async () => {
    firestore.seed("events", "e1", { seasonId: "s1", name: "Montafon" });

    await expect(scoped("Montafon", "s1")).rejects.toThrow(/in dieser saison/i);
  });
});
