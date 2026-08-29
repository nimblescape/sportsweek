/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyRegistrationLayout from "@/app/app/my-registration/layout";

describe("the student's registration area", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Here rather than on the form, which is one of two pages a student can land on: the other
   * says only that nothing is open, and that is exactly the page somebody reports from.
   */
  it("says which build this is below whatever the student was shown", () => {
    render(
      <MyRegistrationLayout>
        <p>Derzeit ist keine Veranstaltung freigeschaltet.</p>
      </MyRegistrationLayout>,
    );

    const shown = screen.getByText("Derzeit ist keine Veranstaltung freigeschaltet.");
    const stamp = screen.getByText("v1.2.3 · a1b2c3d");

    expect(shown.compareDocumentPosition(stamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stamp).toHaveClass("text-center");
  });

  it("shows the page alone when the build stamped nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "");

    render(
      <MyRegistrationLayout>
        <p>Registrierung</p>
      </MyRegistrationLayout>,
    );

    expect(screen.getByText("Registrierung")).toBeInTheDocument();
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });
});
