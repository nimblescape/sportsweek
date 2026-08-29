/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();

vi.mock("@/lib/session", () => ({ getSessionUser }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const Home = (await import("@/app/page")).default;

describe("root page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a signed-in user into the app, where the role decides the landing", async () => {
    getSessionUser.mockResolvedValue({
      uid: "uid-1",
      email: "jane@htldornbirn.at",
      accountType: "teacher",
    });

    await expect(Home()).rejects.toThrow("REDIRECT:/app");
  });

  it("sends a signed-out visitor to sign-in", async () => {
    getSessionUser.mockResolvedValue(null);

    await expect(Home()).rejects.toThrow("REDIRECT:/sign-in");
  });
});
