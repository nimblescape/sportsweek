/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const collection = vi.fn((_db: unknown, path: string) => path);

vi.mock("firebase/firestore", () => ({
  collection: (...args: [unknown, string]) => collection(...args),
  query: vi.fn((...args: unknown[]) => args),
  onSnapshot,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { useSavedReports } = await import("./use-saved-reports");
const { storedEventSeries } = await import("@/test/event-series");
const { EMPTY_FILTER } = await import("@/lib/filters/student-filter");

const LISTS = storedEventSeries({ name: "Wintersportwoche", classOptions: ["5AHIF"] });

/** The hook waits for Firebase Auth, so a test has to announce a signed-in user first. */
function signIn() {
  act(() =>
    (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "uid-1" }),
  );
}

describe("useSavedReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue(undefined);
    onSnapshot.mockReturnValue(() => {});
    onAuthStateChanged.mockReturnValue(() => {});
  });

  /** A report filters on one series' lists, so another series' row is no part of this one. */
  it("reads the row of the series it was given, and no other", () => {
    renderHook(() => useSavedReports("s1", LISTS));
    signIn();

    expect(collection).toHaveBeenCalledWith({}, "eventSeries/s1/savedReports");
  });

  it("subscribes again when the selection moves to another series", () => {
    const { rerender } = renderHook(({ id }) => useSavedReports(id, LISTS), {
      initialProps: { id: "s1" },
    });
    signIn();

    rerender({ id: "s2" });
    signIn();

    expect(collection).toHaveBeenCalledWith({}, "eventSeries/s2/savedReports");
  });
});

type Doc = { id: string; data: () => Record<string, unknown> };

function deliver(...reports: { id: string; data: Record<string, unknown> }[]) {
  const docs: Doc[] = reports.map(({ id, data }) => ({ id, data: () => data }));
  act(() => (onSnapshot.mock.calls.at(-1)![1] as (snapshot: { docs: Doc[] }) => void)({ docs }));
}

const report = (tags: string[], fields: string[]) => ({
  id: "r1",
  data: {
    name: "5AHIF",
    filter: { ...EMPTY_FILTER, tags: { ...EMPTY_FILTER.tags, class: tags } },
    fields,
    createdByUserId: "uidJaneDoe",
    position: 0,
  },
});

/**
 * A list emptied since a report was saved leaves it holding a tag nothing can show (US-21). It is
 * pruned where it is read, and written back so that it is stored as it is shown.
 */
describe("useSavedReports — repairing what it prunes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue(undefined);
    onSnapshot.mockReturnValue(() => {});
    onAuthStateChanged.mockReturnValue(() => {});
  });

  it("hands out the report pruned to the lists the series maintains", () => {
    const { result } = renderHook(() => useSavedReports("s1", LISTS));
    signIn();
    deliver(report(["5AHIF", "5BHIF"], ["class", "program"]));

    expect(result.current.reports[0].filter.tags.class).toEqual(["5AHIF"]);
    expect(result.current.reports[0].fields).toEqual(["class"]);
  });

  it("writes the pruned report back, so the store says what the row shows", async () => {
    renderHook(() => useSavedReports("s1", LISTS));
    signIn();
    deliver(report(["5AHIF", "5BHIF"], ["class", "program"]));

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/event-series/s1/saved-reports/r1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = apiRequest.mock.calls[0] as [string, { body: { fields: string[] } }];
    expect(options.body.fields).toEqual(["class"]);
  });

  it("leaves a report the series still asks for alone", () => {
    renderHook(() => useSavedReports("s1", LISTS));
    signIn();
    deliver(report(["5AHIF"], ["class"]));

    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** The repaired report comes back equal to its own pruned form, which is what ends the round. */
  it("repairs a report once, however often the row arrives again", () => {
    renderHook(() => useSavedReports("s1", LISTS));
    signIn();
    deliver(report(["5AHIF", "5BHIF"], ["class"]));
    deliver(report(["5AHIF", "5BHIF"], ["class"]));

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  /** Without the series there is nothing to prune against, so nothing is touched. */
  it("prunes nothing while the series has not arrived", () => {
    const { result } = renderHook(() => useSavedReports("s1", null));
    signIn();
    deliver(report(["5AHIF", "5BHIF"], ["class", "program"]));

    expect(result.current.reports[0].fields).toEqual(["class", "program"]);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
