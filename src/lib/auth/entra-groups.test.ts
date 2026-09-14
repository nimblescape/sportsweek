/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { entraGroupClaims } from "./entra-groups";

/** A token shaped like the one Entra returns — unsigned, since nothing here verifies it. */
function idToken(payload: Record<string, unknown>): string {
  const segment = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  return `${segment({ alg: "RS256", typ: "JWT" })}.${segment(payload)}.signature`;
}

const GROUP_ID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";

describe("entraGroupClaims", () => {
  it("reads the group object IDs Entra puts in the groups claim", () => {
    expect(entraGroupClaims(idToken({ groups: [GROUP_ID] }))).toMatchObject({
      groups: [GROUP_ID],
      roles: [],
    });
  });

  it("reads them from roles as well, which is where 'emit groups as role claims' puts them", () => {
    expect(entraGroupClaims(idToken({ roles: [GROUP_ID] }))).toMatchObject({
      groups: [],
      roles: [GROUP_ID],
    });
  });

  it("reports the overflow Entra signals instead of a groups claim that was too long", () => {
    expect(entraGroupClaims(idToken({ hasgroups: true }))?.overflowed).toBe(true);
  });

  it("is not overflowed when the claim is simply absent", () => {
    expect(entraGroupClaims(idToken({}))).toEqual({ groups: [], roles: [], overflowed: false });
  });

  it("keeps only the strings, whatever else an array holds", () => {
    expect(entraGroupClaims(idToken({ groups: [GROUP_ID, 7, null] }))?.groups).toEqual([GROUP_ID]);
  });

  it("reads a payload carrying non-ASCII, which base64url leaves as UTF-8 bytes", () => {
    expect(entraGroupClaims(idToken({ name: "Müller", groups: [GROUP_ID] }))?.groups).toEqual([
      GROUP_ID,
    ]);
  });

  it("answers null for something that is not a token", () => {
    expect(entraGroupClaims("not-a-token")).toBeNull();
    expect(entraGroupClaims("")).toBeNull();
    expect(entraGroupClaims("a.!!!.c")).toBeNull();
  });
});
