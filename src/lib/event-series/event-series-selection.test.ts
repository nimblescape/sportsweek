/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  isMasterDataPath,
  rescopedPath,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";

/**
 * Where a teacher is maintaining what a series is made of, as against looking at what its
 * students answered. Only there is a template worth offering: it holds lists and no
 * registrations, so it has nothing to show an overview, an assignment or a report (US-22).
 */
describe("isMasterDataPath", () => {
  it.each([
    "/app/event-series",
    "/app/event-series/s1",
    "/app/s1/master-data/classes",
    "/app/s1/master-data/programs",
  ])("counts %s as maintaining master data", (pathname) => {
    expect(isMasterDataPath(pathname)).toBe(true);
  });

  it.each(["/app/s1/overview", "/app/s1/assignment", "/app/s1/report", "/app/my-registration"])(
    "counts %s as looking at students",
    (pathname) => {
      expect(isMasterDataPath(pathname)).toBe(false);
    },
  );
});

describe("selectedEventSeriesIdFrom", () => {
  it.each([
    ["/app/s1/report", "s1"],
    ["/app/s1/assignment", "s1"],
    ["/app/s1/overview", "s1"],
    ["/app/s1/master-data/classes", "s1"],
    ["/app/s1", "s1"],
  ])("reads the id out of %s", (pathname, expected) => {
    expect(selectedEventSeriesIdFrom(pathname)).toBe(expected);
  });

  /**
   * These are pages beside a series rather than inside one, and Next.js prefers a static segment
   * over a dynamic one — so reading them as an id would name a series that does not exist.
   */
  it.each(["/app/event-series", "/app/event-series/s1", "/app/my-registration"])(
    "reads no selection out of %s",
    (pathname) => {
      expect(selectedEventSeriesIdFrom(pathname)).toBeNull();
    },
  );

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
    ["/app/s1/overview", "/app/s2/overview"],
    ["/app/s1/master-data/classes", "/app/s2/master-data/classes"],
  ])("keeps the page open when re-scoping %s", (pathname, expected) => {
    expect(rescopedPath(pathname, "s2")).toBe(expected);
  });

  /** From a page about no series there is no view worth keeping, so the overview opens. */
  it.each(["/app/event-series", "/app/event-series/s1", "/app"])(
    "opens the overview when leaving %s",
    (pathname) => {
      expect(rescopedPath(pathname, "s2")).toBe("/app/s2/overview");
    },
  );

  it("encodes the id it puts in the path", () => {
    expect(rescopedPath("/app/s1/report", "a/b")).toBe("/app/a%2Fb/report");
  });

  /**
   * A template holds lists and no registrations (US-22), so an overview, an assignment or a
   * report has nothing to show for one — and the row offering the tag is gone from those pages,
   * so pressing it would take the tag away with it.
   */
  it.each(["/app/event-series", "/app/s1/overview", "/app/s1/report", "/app/s1/assignment"])(
    "opens the master data of a template rather than a page it has nothing for, from %s",
    (pathname) => {
      expect(rescopedPath(pathname, "t1", true)).toBe("/app/t1/master-data/events");
    },
  );

  it("keeps the list open when re-scoping it to a template, that being what a template has", () => {
    expect(rescopedPath("/app/s1/master-data/classes", "t1", true)).toBe(
      "/app/t1/master-data/classes",
    );
  });
});
