/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asUid } from "@/lib/schemas/common";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import { storedEventSeries } from "@/test/event-series";
import { FakeFirestore } from "@/test/fake-firestore";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { createSavedReport, deleteSavedReport, reorderSavedReports, updateSavedReport } =
  await import("./saved-report-service");
const { savedReportPath } = await import("./saved-reports");
const { ServiceError } = await import("@/lib/service-error");

const SERIES = "s1";
const PATH = savedReportPath(SERIES);
const TEACHER = asUid("uidJaneDoe");
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const FIELDS = ["class", "contact"];
const stored = {
  name: "5AHIF",
  filter: selection,
  fields: FIELDS,
  createdByUserId: TEACHER,
  position: 0,
};

beforeEach(() => {
  firestore.reset();
  // A report is pruned to the lists its series maintains (US-21), so the series has to ask the
  // question this one filters on.
  firestore.seed("eventSeries", SERIES, storedEventSeries({ classOptions: ["5AHIF"] }));
  firestore.seed(
    "eventSeries",
    "s2",
    storedEventSeries({ name: "Wintersportwoche 2027", classOptions: ["5AHIF"] }),
  );
});

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

  /**
   * Firestore writes a subcollection under a document that is not there, so without this a save
   * into a deleted series leaves a report nothing can reach and no delete will ever sweep.
   */
  it("refuses a series that is not there, rather than orphaning the report under it", async () => {
    await expect(
      createSavedReport("gone", { name: "5AHIF", filter: selection, fields: [] }, TEACHER),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.count(savedReportPath("gone"))).toBe(0);
  });

  it("keeps only the categories the report filters by, so a stray one cannot be stored", async () => {
    const filter = { ...selection, tags: { ...selection.tags, nonsense: ["x"] } } as never;

    const saved = await createSavedReport(SERIES, { name: "5AHIF", filter, fields: [] }, TEACHER);

    expect(firestore.get(PATH, saved.id)).toMatchObject({ filter: selection });
  });

  it("reads a category that did not exist yet as no restriction from it", async () => {
    const tags = Object.fromEntries(
      Object.entries(selection.tags).filter(([category]) => category !== "event"),
    );

    const saved = await createSavedReport(
      SERIES,
      { name: "5AHIF", filter: { ...selection, tags } as never, fields: [] },
      TEACHER,
    );

    expect(saved.filter.tags.event).toEqual([]);
  });
});

describe("updateSavedReport", () => {
  const replacement = { name: "5AHIF", filter: EMPTY_FILTER, fields: ["contact"] };

  beforeEach(() => firestore.seed(PATH, "r1", stored));

  it("replaces the name and both selections at once, leaving the author as it was", async () => {
    const edit = { ...replacement, name: "5BHIF" };

    const updated = await updateSavedReport(SERIES, "r1", edit);

    expect(updated).toEqual({ id: "r1", ...stored, ...edit });
    expect(firestore.get(PATH, "r1")).toEqual({ ...stored, ...edit });
  });

  it("lets any teacher edit one, since saved reports are shared (US-13)", async () => {
    await expect(
      updateSavedReport(SERIES, "r1", { ...replacement, name: "Alle" }),
    ).resolves.toMatchObject({ name: "Alle" });
  });

  it("keeps only the categories the report filters by, so a stray one cannot be stored", async () => {
    const filter = { ...selection, tags: { ...selection.tags, nonsense: ["x"] } } as never;

    const updated = await updateSavedReport(SERIES, "r1", { ...replacement, filter });

    expect(updated.filter).toEqual(selection);
  });

  it("refuses the author, which the session decides and no request may claim", async () => {
    const edit = { ...replacement, createdByUserId: "uidSomeoneElse" } as never;

    await expect(updateSavedReport(SERIES, "r1", edit)).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get(PATH, "r1")).toEqual(stored);
  });

  it("rejects a blank name", async () => {
    await expect(
      updateSavedReport(SERIES, "r1", { ...replacement, name: " " }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(firestore.get(PATH, "r1")).toMatchObject({ name: "5AHIF" });
  });

  it("reports a saved report that is not there rather than creating it", async () => {
    await expect(updateSavedReport(SERIES, "gone", replacement)).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(firestore.count(PATH)).toBe(1);
  });

  /** The id is unique within its own row only, so the series has to decide which row that is. */
  it("leaves a report of the same id in another series alone", async () => {
    firestore.seed(savedReportPath("s2"), "r1", stored);

    await updateSavedReport(SERIES, "r1", { ...replacement, name: "5BHIF" });

    expect(firestore.get(savedReportPath("s2"), "r1")).toEqual(stored);
  });
});

describe("deleteSavedReport", () => {
  beforeEach(() => firestore.seed(PATH, "r1", stored));

  it("removes it", async () => {
    await deleteSavedReport(SERIES, "r1");

    expect(firestore.count(PATH)).toBe(0);
  });

  it("reports one that is already gone", async () => {
    await expect(deleteSavedReport(SERIES, "gone")).rejects.toBeInstanceOf(ServiceError);
  });

  it("leaves a report of the same id in another series alone", async () => {
    firestore.seed(savedReportPath("s2"), "r1", stored);

    await deleteSavedReport(SERIES, "r1");

    expect(firestore.count(savedReportPath("s2"))).toBe(1);
  });
});

describe("reorderSavedReports", () => {
  beforeEach(() => {
    firestore.seed(PATH, "r1", { ...stored, position: 0 });
    firestore.seed(PATH, "r2", { ...stored, name: "5BHIF", position: 1 });
  });

  it("renumbers the row from zero, in the order the tags were dropped into", async () => {
    await reorderSavedReports(SERIES, ["r2", "r1"]);

    expect(firestore.get(PATH, "r2")?.position).toBe(0);
    expect(firestore.get(PATH, "r1")?.position).toBe(1);
  });

  it("reports a report that is not there rather than renumbering around it", async () => {
    await expect(reorderSavedReports(SERIES, ["r1", "gone"])).rejects.toBeInstanceOf(ServiceError);
  });
});

/**
 * A report holds only what its series asks for (US-21). Emptying a list leaves the reports that
 * filtered on it holding a tag nothing can show and a field that would print "keine Angabe" for
 * every student — cleared out on the report's next write rather than by a cascade over every
 * report of the series each time a teacher edits a list.
 */
describe("pruning a report to what its series asks for", () => {
  const withoutClasses = { classOptions: [], programs: [] };

  it("drops a tag for a list the series does not maintain", async () => {
    firestore.seed("eventSeries", "bare", storedEventSeries({ name: "Kultur", ...withoutClasses }));

    const saved = await createSavedReport(
      "bare",
      { name: "5AHIF", filter: selection, fields: FIELDS },
      TEACHER,
    );

    expect(saved.filter.tags.class).toEqual([]);
    expect(saved.fields).toEqual(["contact"]);
  });

  it("keeps what the series does maintain", async () => {
    const saved = await createSavedReport(
      SERIES,
      { name: "5AHIF", filter: selection, fields: FIELDS },
      TEACHER,
    );

    expect(saved.filter.tags.class).toEqual(["5AHIF"]);
    expect(saved.fields).toEqual(FIELDS);
  });

  it("prunes on the next edit, which is where a report already holding one is repaired", async () => {
    firestore.seed("eventSeries", "bare", storedEventSeries({ name: "Kultur", ...withoutClasses }));
    firestore.seed(savedReportPath("bare"), "r1", { ...stored, position: 0 });

    const edited = await updateSavedReport("bare", "r1", {
      name: "5AHIF",
      filter: selection,
      fields: FIELDS,
    });

    expect(edited.filter.tags.class).toEqual([]);
    expect(edited.fields).toEqual(["contact"]);
    expect(firestore.get(savedReportPath("bare"), "r1")).toMatchObject({ fields: ["contact"] });
  });
});
