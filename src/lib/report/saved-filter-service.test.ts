/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { createSavedFilter, deleteSavedFilter, renameSavedFilter } =
  await import("./saved-filter-service");
const { ServiceError } = await import("@/lib/service-error");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");

beforeEach(() => firestore.reset());

describe("createSavedFilter", () => {
  it("stores the selection under its name, attributed to the teacher who saved it", async () => {
    const saved = await createSavedFilter({ name: "5AHIF", filter: selection }, TEACHER);

    expect(firestore.get("savedReportFilters", saved.id)).toEqual({
      name: "5AHIF",
      filter: selection,
      createdByUserId: TEACHER,
    });
  });

  it("trims the name, so two teachers do not read the same filter differently", async () => {
    const saved = await createSavedFilter({ name: "  5AHIF  ", filter: selection }, TEACHER);

    expect(saved.name).toBe("5AHIF");
  });

  it("rejects a blank name rather than storing a filter nothing can be picked by", async () => {
    await expect(
      createSavedFilter({ name: "   ", filter: selection }, TEACHER),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("savedReportFilters")).toBe(0);
  });

  it("rejects a selection naming a category the report does not filter by", async () => {
    const filter = { ...selection, tags: { nonsense: ["x"] } } as never;

    await expect(createSavedFilter({ name: "5AHIF", filter }, TEACHER)).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

describe("renameSavedFilter", () => {
  beforeEach(() =>
    firestore.seed("savedReportFilters", "f1", {
      name: "5AHIF",
      filter: selection,
      createdByUserId: TEACHER,
    }),
  );

  it("renames in place and leaves the selection exactly as it was", async () => {
    const renamed = await renameSavedFilter("f1", "5BHIF");

    expect(renamed).toEqual({
      id: "f1",
      name: "5BHIF",
      filter: selection,
      createdByUserId: TEACHER,
    });
  });

  it("lets any teacher rename one, since saved filters are shared (US-13)", async () => {
    await expect(renameSavedFilter("f1", "Alle")).resolves.toMatchObject({ name: "Alle" });
  });

  it("reports a filter that is not there rather than creating it", async () => {
    await expect(renameSavedFilter("gone", "5BHIF")).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("savedReportFilters")).toBe(1);
  });

  it("rejects a blank name", async () => {
    await expect(renameSavedFilter("f1", " ")).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get("savedReportFilters", "f1")).toMatchObject({ name: "5AHIF" });
  });
});

describe("deleteSavedFilter", () => {
  beforeEach(() =>
    firestore.seed("savedReportFilters", "f1", {
      name: "5AHIF",
      filter: selection,
      createdByUserId: TEACHER,
    }),
  );

  it("removes it", async () => {
    await deleteSavedFilter("f1");

    expect(firestore.count("savedReportFilters")).toBe(0);
  });

  it("reports one that is already gone", async () => {
    await expect(deleteSavedFilter("gone")).rejects.toBeInstanceOf(ServiceError);
  });
});
