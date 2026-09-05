/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  isMasterDataPath,
  rescopedPath,
  liveSelection,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";

/**
 * The master data hierarchy is the whole of what lives under `/app/event-series`, and it is what
 * the header does not scope: those pages name in the URL, the title and the breadcrumb which
 * series they are editing, and it may be an archived one the header offers none of (US-33).
 */
describe("isMasterDataPath", () => {
  it.each([
    "/app/event-series",
    "/app/event-series/s1",
    "/app/event-series/s1/classes",
    "/app/event-series/s1/programs",
  ])("counts %s as maintaining master data", (pathname) => {
    expect(isMasterDataPath(pathname)).toBe(true);
  });

  it.each([
    "/app/s1/registrations",
    "/app/s1/assignment",
    "/app/s1/report",
    "/app/my-registration",
  ])("counts %s as looking at students", (pathname) => {
    expect(isMasterDataPath(pathname)).toBe(false);
  });
});

describe("selectedEventSeriesIdFrom", () => {
  it.each([
    ["/app/s1/report", "s1"],
    ["/app/s1/assignment", "s1"],
    ["/app/s1/registrations", "s1"],
    ["/app/s1", "s1"],
  ])("reads the id out of %s", (pathname, expected) => {
    expect(selectedEventSeriesIdFrom(pathname)).toBe(expected);
  });

  /**
   * These are pages beside a series rather than inside one, and Next.js prefers a static segment
   * over a dynamic one — so reading them as an id would name a series that does not exist.
   */
  it.each([
    "/app/event-series",
    "/app/event-series/s1",
    "/app/event-series/s1/classes",
    "/app/my-registration",
  ])("reads no selection out of %s", (pathname) => {
    expect(selectedEventSeriesIdFrom(pathname)).toBeNull();
  });

  it.each(["/app", "/app/", "/sign-in", "/"])("reads no selection out of %s", (pathname) => {
    expect(selectedEventSeriesIdFrom(pathname)).toBeNull();
  });

  /** The links percent-encode the id, so reading one back has to undo that. */
  it("decodes the segment it read", () => {
    expect(selectedEventSeriesIdFrom("/app/a%2Fb/report")).toBe("a/b");
  });
});

describe("rescopedPath", () => {
  /** The teacher asked a different question about the same view, not for a different view (US-20). */
  it.each([
    ["/app/s1/report", "/app/s2/report"],
    ["/app/s1/assignment", "/app/s2/assignment"],
    ["/app/s1/registrations", "/app/s2/registrations"],
  ])("keeps the page open when re-scoping %s", (pathname, expected) => {
    expect(rescopedPath(pathname, "s2")).toBe(expected);
  });

  /** From a page about no series there is no view worth keeping, so the overview opens. */
  it.each(["/app/event-series", "/app/event-series/s1", "/app/event-series/s1/classes", "/app"])(
    "opens the overview when leaving %s",
    (pathname) => {
      expect(rescopedPath(pathname, "s2")).toBe("/app/s2/registrations");
    },
  );

  it("encodes the id it puts in the path", () => {
    expect(rescopedPath("/app/s1/report", "a/b")).toBe("/app/a%2Fb/report");
  });
});

/**
 * Every page can be about every series, so the only thing that can make a remembered id unusable
 * is archiving — which is what takes a series off every screen (US-19).
 */
describe("liveSelection", () => {
  const live = [
    { id: "s1", isArchived: false },
    { id: "s2", isArchived: false },
  ];

  it("keeps the selected series", () => {
    expect(liveSelection(live, "s2")).toBe("s2");
  });

  it.each([null, "gone"])("falls back to the first when %s is selected", (wanted) => {
    expect(liveSelection(live, wanted)).toBe("s1");
  });

  it("falls back when the selected one has been archived", () => {
    expect(liveSelection([{ id: "old", isArchived: true }, ...live], "old")).toBe("s1");
  });

  it("selects nothing when every series is archived", () => {
    expect(liveSelection([{ id: "old", isArchived: true }], "old")).toBeNull();
  });

  it("selects nothing when there is no series at all", () => {
    expect(liveSelection([], null)).toBeNull();
  });
});
