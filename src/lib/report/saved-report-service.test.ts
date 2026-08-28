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

const { createSavedReport, deleteSavedReport, reorderSavedReports, updateSavedReport } =
  await import("./saved-report-service");
const { savedReportPath } = await import("./saved-reports");
const { ServiceError } = await import("@/lib/service-error");

const SERIES = "s1";
const PATH = savedReportPath(SERIES);
const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const FIELDS = ["class", "contact"];
const stored = {
  name: "5AHIF",
  filter: selection,
  fields: FIELDS,
  createdByUserId: TEACHER,
  position: 0,
};

beforeEach(() => firestore.reset());

describe("createSavedReport", () => {
  it("stores both selections under its name, attributed to the teacher who saved it", async () => {
    const saved = await createSavedReport(
      SERIES,
      { name: "5AHIF", filter: selection, fields: FIELDS },
      TEACHER,
    );

    expect(firestore.get(PATH, saved.id)).toEqual(stored);
  });

  /** Two series filter on lists of their own, so neither sees what the other saved (US-13). */
  it("leaves another series' row alone", async () => {
    firestore.seed(savedReportPath("s2"), "r1", stored);

    const saved = await createSavedReport(
      SERIES,
      { name: "5BHIF", filter: selection, fields: [] },
      TEACHER,
    );

    expect(saved.position).toBe(0);
    expect(firestore.count(savedReportPath("s2"))).toBe(1);
  });

  it("puts the new report at the end of the row, where the button that made it stands", async () => {
    firestore.seed(PATH, "r1", stored);

    const saved = await createSavedReport(
      SERIES,
      { name: "5BHIF", filter: selection, fields: [] },
      TEACHER,
    );

    expect(saved.position).toBe(1);
  });

  it("trims the name, so two teachers do not read the same report differently", async () => {
    const saved = await createSavedReport(
      SERIES,
      { name: "  5AHIF  ", filter: selection, fields: [] },
      TEACHER,
    );

    expect(saved.name).toBe("5AHIF");
  });

  it("rejects a blank name rather than storing a report nothing can be opened by", async () => {
    await expect(
      createSavedReport(SERIES, { name: "   ", filter: selection, fields: [] }, TEACHER),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count(PATH)).toBe(0);
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

describe("updateSavedReport", () => {
  const replacement = { name: "5AHIF", filter: EMPTY_FILTER, fields: ["contact"] };

  beforeEach(() => firestore.seed("savedReports", "r1", stored));

  it("replaces the name and both selections at once, leaving the author as it was", async () => {
    const edit = { ...replacement, name: "5BHIF" };

    const updated = await updateSavedReport("r1", edit);

    expect(updated).toEqual({ id: "r1", ...stored, ...edit });
    expect(firestore.get("savedReports", "r1")).toEqual({ ...stored, ...edit });
  });

  it("lets any teacher edit one, since saved reports are shared (US-13)", async () => {
    await expect(updateSavedReport("r1", { ...replacement, name: "Alle" })).resolves.toMatchObject({
      name: "Alle",
    });
  });

  it("keeps only the categories the report filters by, so a stray one cannot be stored", async () => {
    const filter = { ...selection, tags: { ...selection.tags, nonsense: ["x"] } } as never;

    const updated = await updateSavedReport("r1", { ...replacement, filter });

    expect(updated.filter).toEqual(selection);
  });

  it("refuses the author, which the session decides and no request may claim", async () => {
    const edit = { ...replacement, createdByUserId: "someone.else@htldornbirn.at" } as never;

    await expect(updateSavedReport("r1", edit)).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get("savedReports", "r1")).toEqual(stored);
  });

  it("rejects a blank name", async () => {
    await expect(updateSavedReport("r1", { ...replacement, name: " " })).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(firestore.get("savedReports", "r1")).toMatchObject({ name: "5AHIF" });
  });

  it("reports a saved report that is not there rather than creating it", async () => {
    await expect(updateSavedReport("gone", replacement)).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count("savedReports")).toBe(1);
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

describe("reorderSavedReports", () => {
  beforeEach(() => {
    firestore.seed("savedReports", "r1", { ...stored, position: 0 });
    firestore.seed("savedReports", "r2", { ...stored, name: "5BHIF", position: 1 });
  });

  it("renumbers the row from zero, in the order the tags were dropped into", async () => {
    await reorderSavedReports(["r2", "r1"]);

    expect(firestore.get("savedReports", "r2")?.position).toBe(0);
    expect(firestore.get("savedReports", "r1")?.position).toBe(1);
  });

  it("reports a report that is not there rather than renumbering around it", async () => {
    await expect(reorderSavedReports(["r1", "gone"])).rejects.toBeInstanceOf(ServiceError);
  });
});
