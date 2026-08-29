/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: () => requireUser(),
  fetchUserPhoto: async () => null,
}));
vi.mock("@/lib/event-series/event-series-service", () => ({
  resolveSelectedEventSeriesId: async () => "s1",
}));
vi.mock("@/components/layout/teacher-nav", () => ({
  TeacherNav: () => <nav aria-label="Hauptnavigation" />,
}));
vi.mock("@/components/layout/event-series-tag-rows", () => ({
  EventSeriesTagRows: () => <div />,
}));
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Abmelden</button>,
}));

const AppLayout = (await import("@/app/app/layout")).default;

const show = async () =>
  render(await AppLayout({ children: <p>Inhalt</p>, params: Promise.resolve({}) }));

describe("the app frame", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  /**
   * A student is given no bar, so there is nowhere that stays put while their form scrolls.
   * The header is that place: a screenshot of the window says which build it was taken from
   * however far down the form the person taking it had got.
   */
  it("gives a student the build line in the header, beside the brand", async () => {
    requireUser.mockResolvedValue({ email: "s@student.at", accountType: "student" });

    await show();

    expect(screen.getByRole("banner")).toHaveTextContent("v1.2.3 · a1b2c3d");
  });

  // A teacher reads it at the foot of their bar, which does not scroll either.
  it("leaves it to a teacher's bar, keeping the header for what the page is about", async () => {
    requireUser.mockResolvedValue({
      email: "t@htldornbirn.at",
      accountType: "teacher",
      permissions: [],
    });

    await show();

    expect(screen.getByRole("banner")).not.toHaveTextContent("v1.2.3");
    // Twice: a column beside the page on a wide screen, a strip above it on a narrow one.
    expect(screen.getAllByRole("navigation", { name: "Hauptnavigation" })).toHaveLength(2);
  });
});
