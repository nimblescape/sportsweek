/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "@/lib/schemas/collections";

describe("COLLECTIONS", () => {
  it("centralises every collection the data model needs", () => {
    expect(Object.keys(COLLECTIONS).sort()).toEqual(
      [
        "users",
        // The seven teacher-maintained lists — the events among them — are fields of this
        // document rather than collections of their own, so each series keeps its own (US-21).
        "eventSeries",
        // Emergency contact and rented equipment are fields of this record, not collections of
        // their own: neither has an identity outside it, and nothing else refers to them (US-11).
        "registrations",
        // Keyed by the token itself, so following a link is one lookup and nothing has to be
        // searched for a secret (US-23).
        "invitations",
        "savedReports",
        // Beneath the person who signed in, and closed to every client (US-1).
        "logins",
      ].sort(),
    );
  });

  it("maps every key to a unique path segment", () => {
    const values = Object.values(COLLECTIONS);

    expect(new Set(values).size).toBe(values.length);
  });

  it("uses single path segments, so call sites cannot build paths by hand", () => {
    for (const value of Object.values(COLLECTIONS)) {
      expect(value).not.toContain("/");
    }
  });
});
