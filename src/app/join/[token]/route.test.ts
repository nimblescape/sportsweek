/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const resolveInvitation = vi.fn();
const hasRegistration = vi.fn();
const joinEventSeries = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/invitations/invitation-service", () => ({
  resolveInvitation: (token: string) => resolveInvitation(token),
}));
vi.mock("@/lib/registration/registration-service", () => ({
  hasRegistration: (...args: unknown[]) => hasRegistration(...args),
  joinEventSeries: (...args: unknown[]) => joinEventSeries(...args),
}));

const { GET } = await import("./route");

const TOKEN = "a-very-long-unguessable-token";

function follow(token = TOKEN, origin = "https://example.com") {
  return GET(new Request(`${origin}/join/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: "S@student.at",
    accountType: "student",
  });
  resolveInvitation.mockResolvedValue({
    status: "open",
    invitation: { token: TOKEN, eventSeriesId: "s1", class: "3aWI" },
  });
  hasRegistration.mockResolvedValue(false);
});

/**
 * Following the link is what joins a student (US-23), so it is a write rather than a note to
 * self. The registration exists from that moment, which is what lets a later sign-in find it by
 * looking rather than by carrying a token about.
 */
describe("GET /join/[token]", () => {
  it("records the joining, for the class the link names", async () => {
    await follow();

    expect(joinEventSeries).toHaveBeenCalledWith("s1", "u1", "3aWI");
  });

  it("takes the student to the registration the link named", async () => {
    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/my-registration/s1");
  });

  /**
   * The regression this exists for. A Route Handler sees the address the server was reached on,
   * which behind a proxy is the container's own -- so a Location built from it sends the browser
   * to a host only the server can reach. Every redirect here is relative, which the browser
   * resolves against the address it asked for and which no header can be made to lie about.
   */
  it("never names a host, so the container's own address cannot become one", async () => {
    const response = await follow(TOKEN, "http://0.0.0.0:8080");

    expect(response.headers.get("location")).toBe("/app/my-registration/s1");
  });

  /**
   * The write needs to know who joined, and a signed-out visitor is the ordinary case: the link
   * is followed before signing in. They come back here afterwards and join then.
   */
  it("sends a visitor who is not signed in to sign in, and back here", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await follow();

    expect(response.headers.get("location")).toBe(`/sign-in?next=%2Fjoin%2F${TOKEN}`);
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  /** Q12: the commonest teacher to follow a link is the one checking it before sending it out. */
  it("takes a teacher to the dashboard for the series the link names", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "t@htl.at",
      accountType: "teacher",
    });

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/s1/registrations");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  it("takes a teacher whose link leads nowhere to the dashboard, saying nothing", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "t@htl.at",
      accountType: "teacher",
    });
    resolveInvitation.mockResolvedValue({ status: "dead" });

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app");
  });

  /** A live link to a closed class is still the series a teacher regenerated it for (Q12). */
  it("takes a teacher whose link leads to a closed class to that series' own dashboard", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "t@htl.at",
      accountType: "teacher",
    });
    resolveInvitation.mockResolvedValue({
      status: "closed",
      invitation: { token: TOKEN, eventSeriesId: "s1", class: "3aWI" },
    });

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/s1/registrations");
  });

  /**
   * Every reason a link can lead nowhere is answered by the one sentence on the landing page,
   * so this handler joins nobody and says nothing about which of them it was.
   */
  it("takes a student whose link leads nowhere to the landing page, saying nothing", async () => {
    resolveInvitation.mockResolvedValue({ status: "dead" });

    const response = await follow("mistyped");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/app/my-registration");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  /** A joining that cannot be written is a link that led nowhere, as far as a student can see. */
  it("says the same where the joining is refused", async () => {
    joinEventSeries.mockRejectedValue(new Error("closed"));

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/my-registration");
  });

  /**
   * The address is still good, only its window is shut — told apart from a dead link so a
   * student is not sent looking for a new one they do not need (US-45).
   */
  it("tells a student with no registration yet that the link's class is closed", async () => {
    resolveInvitation.mockResolvedValue({
      status: "closed",
      invitation: { token: TOKEN, eventSeriesId: "s1", class: "3aWI" },
    });

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/my-registration/s1?closed=1");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  /** A link only ever leads somewhere; it never moves what a student already holds (Q13). */
  it("takes a student who already holds a registration straight to it, class closed or not", async () => {
    resolveInvitation.mockResolvedValue({
      status: "closed",
      invitation: { token: TOKEN, eventSeriesId: "s1", class: "3aWI" },
    });
    hasRegistration.mockResolvedValue(true);

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/my-registration/s1");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });

  it("does the same for a still-open link, once a registration already exists", async () => {
    hasRegistration.mockResolvedValue(true);

    const response = await follow();

    expect(response.headers.get("location")).toBe("/app/my-registration/s1");
    expect(joinEventSeries).not.toHaveBeenCalled();
  });
});
