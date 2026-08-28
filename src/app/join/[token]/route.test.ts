/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const resolveInvitation = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/invitations/invitation-service", () => ({
  resolveInvitation: (token: string) => resolveInvitation(token),
}));

const { GET } = await import("./route");
const { INVITATION_COOKIE_NAME } = await import("@/lib/invitations/invitation-cookie");

const TOKEN = "a-very-long-unguessable-token";

function follow(token = TOKEN) {
  return GET(new Request(`https://example.com/join/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "s@student.at", role: "student" });
  resolveInvitation.mockResolvedValue({ token: TOKEN, eventSeriesId: "s1", class: "3aWI" });
});

describe("GET /join/[token]", () => {
  it("takes a student to their registration", async () => {
    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration");
  });

  it("remembers the token, so it survives signing in", async () => {
    const response = await follow();
    const cookie = response.cookies.get(INVITATION_COOKIE_NAME);

    expect(cookie?.value).toBe(TOKEN);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  /** The round trip through Entra ID comes back to `/app`, so the cookie has to be set first. */
  it("remembers the token for a visitor who is not signed in yet", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await follow();

    expect(response.cookies.get(INVITATION_COOKIE_NAME)?.value).toBe(TOKEN);
    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration");
  });

  /** Q12: the commonest teacher to follow a link is the one checking it before sending it out. */
  it("takes a teacher to the dashboard for the series the link names", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "t@htl.at", role: "teacher" });

    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app/s1/overview");
  });

  it("takes a teacher whose link leads nowhere to the dashboard, saying nothing", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "t@htl.at", role: "teacher" });
    resolveInvitation.mockResolvedValue(null);

    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app");
  });

  /**
   * Every reason a link can lead nowhere is answered by the one sentence on the landing page,
   * so this handler resolves nothing for a student and therefore tells them nothing here.
   */
  it("takes a student whose link leads nowhere to the same place as any other", async () => {
    resolveInvitation.mockResolvedValue(null);

    const response = await follow("mistyped");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration");
  });
});
