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

const { createSavedReport, deleteSavedReport, renameSavedReport } =
  await import("./saved-report-service");
const { ServiceError } = await import("@/lib/service-error");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const FIELDS = ["class", "contact"];
const stored = { name: "5AHIF", filter: selection, fields: FIELDS, createdByUserId: TEACHER };

beforeEach(() => firestore.reset());

describe("createSavedReport", () => {
  it("stores both selections under its name, attributed to the teacher who saved it", async () => {
    const saved = await createSavedReport(
      { name: "5AHIF", filter: selection, fields: FIELDS },
      TEACHER,
    );

    expect(firestore.get("savedReports", saved.id)).toEqual(stored);
  });

  it("trims the name, so two teachers do not read the same report differently", async () => {
    const saved = await createSavedReport(
      { name: "  5AHIF  ", filter: selection, fields: [] },
      TEACHER,
    );

    expect(saved.name).toBe("5AHIF");
  });

  it("rejects a blank name rather than storing a report nothing can be opened by", async () => {
    await expect(
      createSavedReport({ name: "   ", filter: selection, fields: [] }, TEACHER),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("savedReports")).toBe(0);
  });

  it("keeps only the categories the report filters by, so a stray one cannot be stored", async () => {
    const filter = { ...selection, tags: { ...selection.tags, nonsense: ["x"] } } as never;

    const saved = await createSavedReport({ name: "5AHIF", filter, fields: [] }, TEACHER);

    expect(firestore.get("savedReports", saved.id)).toMatchObject({ filter: selection });
  });

  it("reads a category that did not exist yet as no restriction from it", async () => {
    const tags = Object.fromEntries(
      Object.entries(selection.tags).filter(([category]) => category !== "event"),
    );

    const saved = await createSavedReport(
      { name: "5AHIF", filter: { ...selection, tags } as never, fields: [] },
      TEACHER,
    );

    expect(saved.filter.tags.event).toEqual([]);
  });
});

describe("renameSavedReport", () => {
  beforeEach(() => firestore.seed("savedReports", "r1", stored));

  it("renames in place and leaves both selections exactly as they were", async () => {
    const renamed = await renameSavedReport("r1", "5BHIF");

    expect(renamed).toEqual({ id: "r1", ...stored, name: "5BHIF" });
  });

  it("lets any teacher rename one, since saved reports are shared (US-13)", async () => {
    await expect(renameSavedReport("r1", "Alle")).resolves.toMatchObject({ name: "Alle" });
  });

  it("reports a saved report that is not there rather than creating it", async () => {
    await expect(renameSavedReport("gone", "5BHIF")).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("savedReports")).toBe(1);
  });

  it("rejects a blank name", async () => {
    await expect(renameSavedReport("r1", " ")).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get("savedReports", "r1")).toMatchObject({ name: "5AHIF" });
  });
});

describe("deleteSavedReport", () => {
  beforeEach(() => firestore.seed("savedReports", "r1", stored));

  it("removes it", async () => {
    await deleteSavedReport("r1");

    expect(firestore.count("savedReports")).toBe(0);
  });

  it("reports one that is already gone", async () => {
    await expect(deleteSavedReport("gone")).rejects.toBeInstanceOf(ServiceError);
  });
});
