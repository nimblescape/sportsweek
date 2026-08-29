/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const resolveInvitation = vi.fn();
const joinEventSeries = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/invitations/invitation-service", () => ({
  resolveInvitation: (token: string) => resolveInvitation(token),
}));
vi.mock("@/lib/registration/registration-service", () => ({
  joinEventSeries: (...args: unknown[]) => joinEventSeries(...args),
}));

const { GET } = await import("./route");

const TOKEN = "a-very-long-unguessable-token";

function follow(token = TOKEN) {
  return GET(new Request(`https://example.com/join/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "S@student.at", role: "student" });
  resolveInvitation.mockResolvedValue({ token: TOKEN, eventSeriesId: "s1", class: "3aWI" });
});

/**
 * Following the link is what joins a student (US-23), so it is a write rather than a note to
 * self. The registration exists from that moment, which is what lets a later sign-in find it by
 * looking rather than by carrying a token about.
 */
describe("GET /join/[token]", () => {
  it("records the joining, for the class the link names", async () => {
    await follow();

    expect(joinEventSeries).toHaveBeenCalledWith("s1", "s@student.at", "3aWI");
  });

  it("takes the student to the registration the link named", async () => {
    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration/s1");
  });

  /**
   * The write needs to know who joined, and a signed-out visitor is the ordinary case: the link
   * is followed before signing in. They come back here afterwards and join then.
   */
  it("sends a visitor who is not signed in to sign in, and back here", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await follow();

    expect(response.headers.get("location")).toBe(
      `https://example.com/sign-in?next=%2Fjoin%2F${TOKEN}`,
    );
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  /** Q12: the commonest teacher to follow a link is the one checking it before sending it out. */
  it("takes a teacher to the dashboard for the series the link names", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "t@htl.at", role: "teacher" });

    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app/s1/overview");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  it("takes a teacher whose link leads nowhere to the dashboard, saying nothing", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "t@htl.at", role: "teacher" });
    resolveInvitation.mockResolvedValue(null);

    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app");
  });

  /**
   * Every reason a link can lead nowhere is answered by the one sentence on the landing page,
   * so this handler joins nobody and says nothing about which of them it was.
   */
  it("takes a student whose link leads nowhere to the landing page, saying nothing", async () => {
    resolveInvitation.mockResolvedValue(null);

    const response = await follow("mistyped");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  /** A joining that cannot be written is a link that led nowhere, as far as a student can see. */
  it("says the same where the joining is refused", async () => {
    joinEventSeries.mockRejectedValue(new Error("closed"));

    const response = await follow();

    expect(response.headers.get("location")).toBe("https://example.com/app/my-registration");
  });
});
