/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { invitationLink } from "./invitation-link";

describe("invitationLink", () => {
  it("addresses the join handler by the token, which is all the link carries", () => {
    expect(invitationLink("a-token", "https://sportwoche.example")).toBe(
      "https://sportwoche.example/join/a-token",
    );
  });

  /** It is pasted into a mail and encoded in a QR code, so it has to work away from this tab. */
  it("is absolute, since a relative path leads nowhere in a mail", () => {
    expect(invitationLink("a-token", "https://sportwoche.example")).toMatch(/^https:\/\//);
  });

  it("escapes a token so a link cannot be broken by what is in it", () => {
    expect(invitationLink("a/b?c", "https://example.test")).toBe(
      "https://example.test/join/a%2Fb%3Fc",
    );
  });

  it("takes this tab's own origin when none is named", () => {
    expect(invitationLink("a-token")).toBe(`${window.location.origin}/join/a-token`);
  });
});
