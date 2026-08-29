/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireStudent = vi.fn(async () => ({ uid: "uid-1", email: "jane@htldornbirn.at" }));
const get = vi.fn(async () => ({ id: "jane@htldornbirn.at", data: () => undefined }));

vi.mock("@/lib/auth/guards", () => ({ requireStudent: () => requireStudent() }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: () => ({ doc: () => ({ get }) }) },
}));

// The form reaches Firestore for the lists it offers, which this page's own layout does not need.
vi.mock("@/components/my-registration/my-registration-view", () => ({
  MyRegistrationView: () => <form aria-label="Registrierung" />,
}));

const RegistrationPage = (await import("@/app/app/my-registration/[eventSeriesId]/page")).default;

const show = async () =>
  render(await RegistrationPage({ params: Promise.resolve({ eventSeriesId: "s1" }) }));

describe("the student's registration page", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A student has no navigation bar to carry it, so the foot of their one page is where it goes.
  it("says which build this is, below the form", async () => {
    await show();

    const form = screen.getByRole("form", { name: "Registrierung" });
    const position = form.compareDocumentPosition(screen.getByText("v1.2.3 · a1b2c3d"));

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("centres it under the column the form is capped to", async () => {
    await show();

    expect(screen.getByText("v1.2.3 · a1b2c3d")).toHaveClass("text-center");
  });
});
