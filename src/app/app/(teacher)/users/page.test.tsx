/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermission }));

// Stubbed for its props alone: what this page decides is which identifier the view is handed,
// and the real one reaches for the Firebase client on import.
vi.mock("@/components/users/user-permissions-view", () => ({
  UserPermissionsView: () => null,
}));

const { default: UsersPage } = await import("@/app/app/(teacher)/users/page");

/**
 * The page is where the session meets the view, and the only place the two identifiers a person
 * has are both in reach. Handed the address, the view matched nobody against itself: the
 * navigation was never re-rendered after withdrawing something from yourself, and the guard that
 * keeps you from taking `editUsers` off your own row never appeared (US-31).
 */
describe("UsersPage", () => {
  it("names the signed-in admin by the uid their record is keyed by", async () => {
    requirePermission.mockResolvedValue({ uid: "uid-of-ada", email: "ada@htldornbirn.at" });

    const page = (await UsersPage()) as { props: { signedInUid: string } };

    expect(page.props.signedInUid).toBe("uid-of-ada");
  });

  it("opens only to somebody who may hand permissions out", async () => {
    requirePermission.mockResolvedValue({ uid: "uid-of-ada", email: "ada@htldornbirn.at" });

    await UsersPage();

    expect(requirePermission).toHaveBeenCalledWith("editUsers");
  });
});
