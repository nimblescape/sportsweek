/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { normalizeName, releaseName, reservationRef, reserveName, scopeOf } =
  await import("./unique-name");
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

describe("scopeOf", () => {
  it("uses the collection alone when a name must be globally unique", () => {
    expect(scopeOf("seasons")).toBe("seasons");
  });

  it("includes the parent when a name is only unique inside it", () => {
    expect(scopeOf("events", "s1")).toBe("events:s1");
  });

  it("keeps two parents apart", () => {
    expect(scopeOf("events", "s1")).not.toBe(scopeOf("events", "s2"));
  });
});

describe("reservationRef", () => {
  it("puts the name into the document id, which is what makes it unique", () => {
    expect(reservationRef("seasons", "Winter 2026").id).toBe("seasons|winter 2026");
  });

  it("gives names differing only in case the same id", () => {
    expect(reservationRef("seasons", "WINTER 2026").id).toBe(
      reservationRef("seasons", "  winter 2026 ").id,
    );
  });

  it("keeps a slash out of the id, which would otherwise split the path", () => {
    expect(reservationRef("seasons", "2026/2027").id).not.toContain("/");
  });

  it("still keeps two different slashed names apart", () => {
    expect(reservationRef("seasons", "2026/2027").id).not.toBe(
      reservationRef("seasons", "2027/2028").id,
    );
  });
});

const reserve = (name: string, ownerId: string, scope = "seasons") =>
  firestore.runTransaction((transaction) =>
    reserveName(transaction as never, { scope, name, ownerId }),
  );

describe("reserveName", () => {
  it("claims a free name", async () => {
    await expect(reserve("Winter 2026", "s1")).resolves.toBeUndefined();
  });

  it("records the owner, so a rename can tell its own claim apart", async () => {
    await reserve("Winter 2026", "s1");

    expect(firestore.get("reservedNames", "seasons|winter 2026")).toMatchObject({
      ownerId: "s1",
      name: "Winter 2026",
    });
  });

  it("rejects a name another record already holds", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("Winter 2026", "s2")).rejects.toBeInstanceOf(ServiceError);
  });

  it("reports the clash as a conflict, so the handler answers 409", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("Winter 2026", "s2")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("explains the clash in German", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("Winter 2026", "s2")).rejects.toThrow(/gibt es bereits/i);
  });

  it("rejects a duplicate differing only in case", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("WINTER 2026", "s2")).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects a duplicate differing only in surrounding whitespace", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("  Winter 2026  ", "s2")).rejects.toBeInstanceOf(ServiceError);
  });

  it("allows a name that merely starts the same", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("Winter 2026/27", "s2")).resolves.toBeUndefined();
  });

  it("lets the same owner re-claim its own name, so saving unchanged is fine", async () => {
    await reserve("Winter 2026", "s1");

    await expect(reserve("Winter 2026", "s1")).resolves.toBeUndefined();
  });

  it("reads exactly one document, which is what keeps writes from contending", async () => {
    await reserve("Winter 2026", "s1");

    expect(firestore.count("reservedNames")).toBe(1);
  });
});

describe("reserveName — scoped to a parent", () => {
  it("rejects a duplicate inside the same season", async () => {
    await reserve("Montafon", "e1", scopeOf("events", "s1"));

    await expect(reserve("Montafon", "e2", scopeOf("events", "s1"))).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("allows the same name in a different season", async () => {
    await reserve("Montafon", "e1", scopeOf("events", "s1"));

    await expect(reserve("Montafon", "e2", scopeOf("events", "s2"))).resolves.toBeUndefined();
  });

  it("words the message for a scoped clash differently", async () => {
    await reserve("Montafon", "e1", scopeOf("events", "s1"));

    await expect(reserve("Montafon", "e2", scopeOf("events", "s1"))).rejects.toThrow(
      /gibt es hier bereits/i,
    );
  });
});

describe("releaseName", () => {
  it("frees the name for another record", async () => {
    await reserve("Winter 2026", "s1");

    await firestore.runTransaction(async (transaction) =>
      releaseName(transaction as never, { scope: "seasons", name: "Winter 2026" }),
    );

    await expect(reserve("Winter 2026", "s2")).resolves.toBeUndefined();
  });

  it("removes the reservation document", async () => {
    await reserve("Winter 2026", "s1");

    await firestore.runTransaction(async (transaction) =>
      releaseName(transaction as never, { scope: "seasons", name: "Winter 2026" }),
    );

    expect(firestore.count("reservedNames")).toBe(0);
  });

  it("matches the reservation regardless of how the name is cased", async () => {
    await reserve("Winter 2026", "s1");

    await firestore.runTransaction(async (transaction) =>
      releaseName(transaction as never, { scope: "seasons", name: "  WINTER 2026 " }),
    );

    expect(firestore.count("reservedNames")).toBe(0);
  });
});
